import { Inject, Injectable, Logger } from '@nestjs/common';
import type { payments, Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { subCacheKey } from '../exams/entitlement.service';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BillingService, num } from './billing.service';
import {
  PAYMENT_GATEWAYS,
  type GatewayName,
  type PaymentGateway,
  type Verdict,
} from './gateways/payment-gateway';
import { subscriptionActivated } from './templates';
import { ulid } from './ulid';

const DAY_MS = 86_400_000;
const OPEN: payments['status'][] = ['initiated', 'pending'];
/** A gateway can confirm after we marked failed/cancelled (slow bank), so those may still become paid. */
const SETTLEABLE: payments['status'][] = ['initiated', 'pending', 'failed', 'cancelled'];

export interface CheckoutInput {
  packageId: bigint;
  gateway: GatewayName;
  couponCode: string | undefined;
  returnPlatform: 'web' | 'android' | 'ios';
}

type PaymentWithPackage = payments & { packages: { name_bn: string } };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly gateways: Map<GatewayName, PaymentGateway>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
    private readonly limits: RateLimitService,
    private readonly notifications: NotificationService,
    @Inject(PAYMENT_GATEWAYS) gateways: PaymentGateway[],
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.gateways = new Map(gateways.map((g) => [g.name, g]));
  }

  private gateway(name: GatewayName): PaymentGateway {
    const g = this.gateways.get(name);
    if (!g) throw new ApiException('VALIDATION_FAILED', { fields: { gateway: 'unsupported' } });
    return g;
  }

  // ------------------------------------------------------------------ checkout

  /** FR-PAY-02: price it, store the payment, hand back the gateway page. Nothing is granted yet. */
  async checkout(userId: bigint, input: CheckoutInput) {
    await this.limits.assert(`checkout:${userId}`, 10, 60);
    const gateway = this.gateway(input.gateway);
    const quote = await this.billing.quote(userId, input.packageId, input.couponCode);
    const user = await this.prisma.users.findUniqueOrThrow({ where: { id: userId } });

    const payment = await this.prisma.payments.create({
      data: {
        user_id: userId,
        package_id: quote.pkg.id,
        coupon_id: quote.coupon?.id ?? null,
        amount_bdt: quote.payableBdt,
        discount_bdt: quote.discountBdt,
        gateway: input.gateway,
        merchant_tran_id: ulid(),
        gateway_payload: { return_platform: input.returnPlatform },
      },
    });

    // A 100% coupon: nothing to charge, so skip the gateway and grant directly.
    if (quote.payableBdt === 0) {
      await this.settle(payment.id, `FREE-${payment.id}`, { free: true });
      return {
        payment_id: String(payment.id),
        redirect_url: this.landingUrl(payment.id, input.returnPlatform),
        payable_bdt: 0,
      };
    }

    const returnUrl = `${this.config.PUBLIC_API_URL}/v1/payments/return/${input.gateway}?pid=${payment.id}`;
    try {
      const created = await gateway.create({
        paymentId: payment.id,
        merchantTranId: payment.merchant_tran_id,
        amountBdt: quote.payableBdt,
        productName: quote.pkg.name_en,
        customer: { id: user.id, name: user.name, phone: user.phone },
        returnUrl,
        ipnUrl: `${this.config.PUBLIC_API_URL}/v1/payments/webhooks/${input.gateway}`,
      });
      await this.prisma.payments.update({
        where: { id: payment.id },
        data: {
          status: 'pending',
          gateway_tran_id: created.gatewayRef ?? null,
          gateway_payload: {
            return_platform: input.returnPlatform,
            ...(created.gatewayRef ? { gateway_ref: created.gatewayRef } : {}),
          },
        },
      });
      return {
        payment_id: String(payment.id),
        redirect_url: created.redirectUrl,
        payable_bdt: quote.payableBdt,
      };
    } catch (err) {
      this.logger.error(
        `gateway ${input.gateway} create failed for payment ${payment.id}: ${(err as Error).message}`,
      );
      await this.prisma.payments.update({ where: { id: payment.id }, data: { status: 'failed' } });
      throw new ApiException('INTERNAL_ERROR');
    }
  }

  // ------------------------------------------------------------------ reading

  private toDto(p: PaymentWithPackage) {
    return {
      id: String(p.id),
      package_name: p.packages.name_bn,
      amount_bdt: num(p.amount_bdt),
      discount_bdt: num(p.discount_bdt),
      gateway: p.gateway,
      status: p.status,
      gateway_tran_id: p.gateway_tran_id,
      created_at: p.created_at.toISOString(),
      paid_at: p.paid_at?.toISOString() ?? null,
    };
  }

  /**
   * Status poll. A payment still open after the customer returned is re-checked with the gateway
   * (at most every 5 s), so a lost IPN cannot leave someone paid but not activated.
   */
  async get(userId: bigint, id: bigint) {
    let p = await this.load(id);
    if (p.user_id !== userId) throw new ApiException('NOT_FOUND');
    if (OPEN.includes(p.status)) {
      const gate = await this.redis.client.set(`pay:recheck:${id}`, '1', 'EX', 5, 'NX');
      if (gate === 'OK') {
        await this.process(p, {});
        p = await this.load(id);
      }
    }
    return this.toDto(p);
  }

  async history(userId: bigint) {
    const rows = await this.prisma.payments.findMany({
      where: { user_id: userId },
      include: { packages: { select: { name_bn: true } } },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.toDto(r));
  }

  private async load(id: bigint): Promise<PaymentWithPackage> {
    const p = await this.prisma.payments.findUnique({
      where: { id },
      include: { packages: { select: { name_bn: true } } },
    });
    if (!p) throw new ApiException('NOT_FOUND');
    return p;
  }

  // ------------------------------------------------------------------ gateway callbacks

  /** Browser came back from the gateway: verify, then send the person to the app. */
  async handleReturn(
    name: GatewayName,
    pid: string,
    hint: Record<string, string>,
  ): Promise<string> {
    if (!/^\d{1,19}$/.test(pid)) throw new ApiException('NOT_FOUND');
    const p = await this.load(BigInt(pid));
    if (p.gateway !== name) throw new ApiException('NOT_FOUND');
    await this.process(p, hint);
    return this.landingUrl(p.id, this.returnPlatformOf(p));
  }

  /** IPN: the body only says which payment to look at; the gateway's API decides the outcome. */
  async handleWebhook(name: GatewayName, body: Record<string, string>): Promise<void> {
    const tran = body['tran_id'] ?? body['merchantInvoiceNumber'];
    const ref = body['paymentID'];
    const p = tran
      ? await this.prisma.payments.findUnique({
          where: { merchant_tran_id: tran },
          include: { packages: { select: { name_bn: true } } },
        })
      : ref
        ? await this.prisma.payments.findFirst({
            where: { gateway: name, gateway_tran_id: ref },
            include: { packages: { select: { name_bn: true } } },
          })
        : null;
    if (!p || p.gateway !== name) return; // unknown payment: acknowledge, nothing to do
    await this.process(p, body);
  }

  private returnPlatformOf(p: payments): 'web' | 'android' | 'ios' {
    const v = (p.gateway_payload as { return_platform?: string } | null)?.return_platform;
    return v === 'android' || v === 'ios' ? v : 'web';
  }

  private landingUrl(id: bigint, platform: 'web' | 'android' | 'ios'): string {
    return platform === 'web'
      ? `${this.config.WEB_BASE_URL}/payment/${id}/status`
      : `${this.config.APP_SCHEME}://payment/${id}`;
  }

  // ------------------------------------------------------------------ settlement

  /** Ask the gateway, then apply the answer. Safe to call any number of times, concurrently. */
  private async process(p: payments, hint: Record<string, string>): Promise<void> {
    if (p.status === 'paid' || p.status === 'refunded') return;
    const ref =
      (p.gateway_payload as { gateway_ref?: string } | null)?.gateway_ref ?? p.gateway_tran_id;
    const verdict: Verdict = await this.gateway(p.gateway as GatewayName).verify(
      {
        id: p.id,
        merchantTranId: p.merchant_tran_id,
        amountBdt: num(p.amount_bdt),
        gatewayRef: ref,
      },
      hint,
    );
    if (verdict.state === 'paid') {
      await this.settle(p.id, verdict.gatewayTranId, verdict.raw);
    } else if (verdict.state === 'failed' || verdict.state === 'cancelled') {
      await this.prisma.payments.updateMany({
        where: { id: p.id, status: { in: OPEN } },
        data: { status: verdict.state, gateway_payload: this.keepRef(p, verdict.raw) },
      });
    }
  }

  private keepRef(p: payments, raw: unknown): Prisma.InputJsonValue {
    const prev = (p.gateway_payload ?? {}) as Record<string, unknown>;
    return JSON.parse(
      JSON.stringify({
        return_platform: prev['return_platform'],
        gateway_ref: prev['gateway_ref'],
        last: raw,
      }),
    ) as Prisma.InputJsonValue;
  }

  /**
   * FR-PAY-06: payment -> paid, subscription, coupon redemption in ONE transaction. The status
   * compare-and-set means exactly one caller wins; `subscriptions.payment_id` is also unique, so even a
   * bug here could not double-grant. Returns false when someone else already settled it.
   */
  async settle(paymentId: bigint, gatewayTranId: string, raw: unknown): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payments.updateMany({
        where: { id: paymentId, status: { in: SETTLEABLE } },
        data: {
          status: 'paid',
          paid_at: new Date(),
          gateway_tran_id: gatewayTranId,
          gateway_payload: JSON.parse(JSON.stringify({ settled: raw })) as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) return null;

      const pay = await tx.payments.findUniqueOrThrow({
        where: { id: paymentId },
        include: { packages: true },
      });
      const now = new Date();
      // Renewing early stacks: the new period starts when the current one ends.
      const latest = await tx.subscriptions.aggregate({
        where: { user_id: pay.user_id, ends_at: { gt: now } },
        _max: { ends_at: true },
      });
      const startsAt = latest._max.ends_at && latest._max.ends_at > now ? latest._max.ends_at : now;
      const endsAt = new Date(startsAt.getTime() + pay.packages.duration_days * DAY_MS);
      await tx.subscriptions.create({
        data: {
          user_id: pay.user_id,
          package_id: pay.package_id,
          payment_id: pay.id,
          source: 'payment',
          category_ids: pay.packages.category_ids ?? undefined,
          starts_at: startsAt,
          ends_at: endsAt,
        },
      });
      if (pay.coupon_id !== null) {
        await tx.coupon_redemptions.create({
          data: { coupon_id: pay.coupon_id, user_id: pay.user_id, payment_id: pay.id },
        });
        await tx.coupons.update({
          where: { id: pay.coupon_id },
          data: { used_count: { increment: 1 } },
        });
      }
      return { userId: pay.user_id, endsAt };
    });
    if (!result) return false;

    await this.redis.client.del(subCacheKey(result.userId));
    await this.notifications
      .notify(result.userId, subscriptionActivated(result.endsAt))
      .catch((e: Error) => this.logger.warn(`activation notice failed: ${e.message}`));
    return true;
  }
}
