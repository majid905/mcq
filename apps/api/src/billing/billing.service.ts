import { Injectable } from '@nestjs/common';
import type { coupons, packages } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { subCacheKey } from '../exams/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { discountFor, payable } from './pricing';

const DAY_MS = 86_400_000;

export const num = (d: { toString(): string } | number): number => Number(d.toString());
export const idList = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.map((x) => String(x)) : null;

export interface PackageDto {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  duration_days: number;
  price_bdt: number;
  compare_at_bdt: number | null;
  is_featured: boolean;
  category_ids: string[] | null;
}

export interface Quote {
  pkg: packages;
  coupon: coupons | null;
  discountBdt: number;
  payableBdt: number;
}

/** FR-PAY-01, FR-PAY-03, FR-PAY-04: package list, coupon rules and the free trial. */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  async listPackages(): Promise<PackageDto[]> {
    const rows = await this.prisma.packages.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return rows.map((p) => ({
      id: String(p.id),
      name: p.name_bn,
      description: p.description,
      features: Array.isArray(p.features) ? p.features.map(String) : [],
      duration_days: p.duration_days,
      price_bdt: num(p.price_bdt),
      compare_at_bdt: p.compare_at_bdt === null ? null : num(p.compare_at_bdt),
      is_featured: p.is_featured,
      category_ids: idList(p.category_ids),
    }));
  }

  /**
   * Price of `packageId` for `userId` with an optional coupon. Every coupon rule is checked here so
   * both the preview endpoint and checkout use the same answer. Any coupon problem is COUPON_INVALID
   * (we do not tell which, so codes cannot be probed).
   */
  async quote(userId: bigint, packageId: bigint, code: string | undefined): Promise<Quote> {
    const pkg = await this.prisma.packages.findFirst({
      where: { id: Number(packageId), is_active: true },
    });
    if (!pkg) throw new ApiException('NOT_FOUND');
    const price = num(pkg.price_bdt);
    if (!code) return { pkg, coupon: null, discountBdt: 0, payableBdt: price };

    const coupon = await this.prisma.coupons.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    const now = new Date();
    const ids = coupon ? idList(coupon.package_ids) : null;
    if (
      !coupon ||
      !coupon.is_active ||
      (coupon.starts_at && coupon.starts_at > now) ||
      (coupon.ends_at && coupon.ends_at <= now) ||
      (ids && !ids.includes(String(pkg.id))) ||
      (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit)
    ) {
      throw new ApiException('COUPON_INVALID');
    }
    const usedByUser = await this.prisma.coupon_redemptions.count({
      where: { coupon_id: coupon.id, user_id: userId },
    });
    if (usedByUser >= coupon.per_user_limit) throw new ApiException('COUPON_INVALID');

    const discount = discountFor(price, {
      type: coupon.type,
      value: num(coupon.value),
      maxDiscountBdt: coupon.max_discount_bdt === null ? null : num(coupon.max_discount_bdt),
    });
    return { pkg, coupon, discountBdt: discount, payableBdt: payable(price, discount) };
  }

  async validateCoupon(userId: bigint, code: string, packageId: bigint) {
    const q = await this.quote(userId, packageId, code);
    return { discount_bdt: q.discountBdt, payable_bdt: q.payableBdt };
  }

  /** FR-PAY-04: N free premium days, once per account (the phone is the account). */
  async startTrial(userId: bigint) {
    const now = new Date();
    const active = await this.prisma.subscriptions.count({
      where: { user_id: userId, starts_at: { lte: now }, ends_at: { gt: now } },
    });
    if (active > 0) throw new ApiException('TRIAL_USED');
    const days = await this.settings.number('trial_days', 7);
    const endsAt = new Date(now.getTime() + days * DAY_MS);

    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: two parallel taps cannot both start a trial.
      const claimed = await tx.users.updateMany({
        where: { id: userId, trial_used: false },
        data: { trial_used: true },
      });
      if (claimed.count === 0) throw new ApiException('TRIAL_USED');
      await tx.subscriptions.create({
        data: { user_id: userId, source: 'trial', starts_at: now, ends_at: endsAt },
      });
    });
    await this.redis.client.del(subCacheKey(userId));
    return {
      is_premium: true,
      source: 'trial' as const,
      ends_at: endsAt.toISOString(),
      category_ids: null,
      trial_available: false,
    };
  }
}
