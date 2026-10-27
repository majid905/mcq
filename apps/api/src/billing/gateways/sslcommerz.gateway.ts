import { Logger } from '@nestjs/common';
import type {
  CreatedPayment,
  GatewayOrder,
  PaymentGateway,
  StoredPayment,
  Verdict,
} from './payment-gateway';

export interface SslcommerzOptions {
  storeId: string;
  storePassword: string;
  live: boolean;
}

interface Element {
  status?: string;
  tran_id?: string;
  val_id?: string;
  bank_tran_id?: string;
  amount?: string;
  currency_type?: string;
  currency_amount?: string;
}

/** SSLCommerz hosted checkout: init session, then validate by our tran_id (docs: Validation API). */
export class SslcommerzGateway implements PaymentGateway {
  readonly name = 'sslcommerz' as const;
  private readonly logger = new Logger('SSLCommerz');
  private readonly base: string;

  constructor(private readonly opts: SslcommerzOptions) {
    this.base = opts.live ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com';
  }

  async create(o: GatewayOrder): Promise<CreatedPayment> {
    const sep = o.returnUrl.includes('?') ? '&' : '?';
    const form = new URLSearchParams({
      store_id: this.opts.storeId,
      store_passwd: this.opts.storePassword,
      total_amount: o.amountBdt.toFixed(2),
      currency: 'BDT',
      tran_id: o.merchantTranId,
      success_url: o.returnUrl,
      fail_url: `${o.returnUrl}${sep}result=failed`,
      cancel_url: `${o.returnUrl}${sep}result=cancelled`,
      ipn_url: o.ipnUrl,
      product_name: o.productName.slice(0, 100),
      product_category: 'subscription',
      product_profile: 'non-physical-goods',
      shipping_method: 'NO',
      num_of_item: '1',
      cus_name: o.customer.name || 'Student',
      cus_email: 'no-reply@mcq.local',
      cus_add1: 'Bangladesh',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: o.customer.phone,
      value_a: String(o.paymentId),
    });
    const res = await fetch(`${this.base}/gwprocess/v4/api.php`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as {
      status?: string;
      GatewayPageURL?: string;
      failedreason?: string;
    };
    if (json.status !== 'SUCCESS' || !json.GatewayPageURL) {
      this.logger.warn(`init failed: ${json.failedreason ?? res.status}`);
      throw new Error('SSLCOMMERZ_INIT_FAILED');
    }
    return { redirectUrl: json.GatewayPageURL, raw: { status: json.status } };
  }

  async verify(p: StoredPayment, hint: Record<string, string>): Promise<Verdict> {
    if (hint['result'] === 'cancelled' && !hint['val_id']) {
      return { state: 'cancelled', raw: { hint } };
    }
    const url =
      `${this.base}/validator/api/merchantTransIDvalidationAPI.php?tran_id=${encodeURIComponent(p.merchantTranId)}` +
      `&store_id=${encodeURIComponent(this.opts.storeId)}` +
      `&store_passwd=${encodeURIComponent(this.opts.storePassword)}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { state: 'pending', raw: { http: res.status } };
    const body = (await res.json()) as { element?: Element[] };
    const rows = body.element ?? [];
    const good = rows.find((e) => e.status === 'VALID' || e.status === 'VALIDATED');
    if (good) {
      // The amount we asked for must be the amount that was paid, in BDT.
      const paid = Number(good.currency_type === 'BDT' ? good.amount : good.currency_amount);
      if (good.tran_id === p.merchantTranId && paid === p.amountBdt) {
        return {
          state: 'paid',
          gatewayTranId: good.bank_tran_id || good.val_id || p.merchantTranId,
          raw: body,
        };
      }
      this.logger.error(`amount/tran mismatch for payment ${p.id}: ${JSON.stringify(good)}`);
      return { state: 'failed', raw: body };
    }
    const state = rows.some((e) => e.status === 'CANCELLED')
      ? 'cancelled'
      : rows.some((e) => e.status === 'FAILED' || e.status === 'EXPIRED')
        ? 'failed'
        : 'pending';
    return { state, raw: body };
  }
}
