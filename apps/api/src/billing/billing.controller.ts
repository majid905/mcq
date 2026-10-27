import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ApiException } from '../common/api-exception';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SkipGate } from '../gate/skip-gate.decorator';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import type { GatewayName } from './gateways/payment-gateway';

const id = z.string().regex(/^\d{1,19}$/);
const couponBody = z.object({ code: z.string().min(1).max(40), package_id: id });
const checkoutBody = z.object({
  package_id: id,
  gateway: z.enum(['bkash', 'sslcommerz']),
  coupon_code: z.string().min(1).max(40).optional(),
  return_platform: z.enum(['web', 'android', 'ios']).default('web'),
});

const gatewayOf = (raw: string): GatewayName => {
  if (raw !== 'bkash' && raw !== 'sslcommerz') throw new ApiException('NOT_FOUND');
  return raw;
};
/** Query + form fields as plain strings; gateways send nothing else we care about. */
const flat = (...parts: unknown[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (part && typeof part === 'object') {
      for (const [k, v] of Object.entries(part)) if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
};

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payments: PaymentsService,
  ) {}

  @Public()
  @Get('packages')
  packages() {
    return this.billing.listPackages();
  }

  @Post('coupons/validate')
  @HttpCode(200)
  validate(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(couponBody)) b: z.infer<typeof couponBody>,
  ) {
    return this.billing.validateCoupon(auth.userId, b.code, parseId(b.package_id));
  }

  @Post('me/trial')
  @HttpCode(200)
  trial(@CurrentUser() auth: AuthUser) {
    return this.billing.startTrial(auth.userId);
  }

  @Post('payments/checkout')
  async checkout(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(checkoutBody)) b: z.infer<typeof checkoutBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.payments.checkout(auth.userId, {
      packageId: parseId(b.package_id),
      gateway: b.gateway,
      couponCode: b.coupon_code,
      returnPlatform: b.return_platform,
    });
  }

  // `history` must be declared before `:id` or it would be read as an id.
  @Get('payments/history')
  history(@CurrentUser() auth: AuthUser) {
    return this.payments.history(auth.userId);
  }

  @Get('payments/:id')
  get(@CurrentUser() auth: AuthUser, @Param('id') raw: string) {
    return this.payments.get(auth.userId, parseId(raw));
  }

  // ---- gateway side: no user token, and they must work even during maintenance.

  @Public()
  @SkipGate()
  @Post('payments/webhooks/:gateway')
  @HttpCode(200)
  async webhook(@Param('gateway') gateway: string, @Body() body: unknown): Promise<void> {
    await this.payments.handleWebhook(gatewayOf(gateway), flat(body));
  }

  @Public()
  @SkipGate()
  @Get('payments/return/:gateway')
  async returnGet(
    @Param('gateway') gateway: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const to = await this.payments.handleReturn(
      gatewayOf(gateway),
      String(query['pid'] ?? ''),
      flat(query),
    );
    res.redirect(302, to);
  }

  @Public()
  @SkipGate()
  @Post('payments/return/:gateway')
  async returnPost(
    @Param('gateway') gateway: string,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
    @Req() _req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const to = await this.payments.handleReturn(
      gatewayOf(gateway),
      String(query['pid'] ?? ''),
      flat(query, body),
    );
    res.redirect(303, to);
  }
}
