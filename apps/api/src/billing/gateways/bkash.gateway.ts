import { Logger } from '@nestjs/common';
import type { RedisService } from '../../redis/redis.service';
import type {
  CreatedPayment,
  GatewayOrder,
  PaymentGateway,
  StoredPayment,
  Verdict,
} from './payment-gateway';

export interface BkashOptions {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  live: boolean;
}

interface BkashReply {
  statusCode?: string;
  statusMessage?: string;
  id_token?: string;
  expires_in?: number;
  paymentID?: string;
  bkashURL?: string;
  transactionStatus?: string;
  trxID?: string;
  amount?: string;
  merchantInvoiceNumber?: string;
}

const TOKEN_KEY = 'bkash:id_token';

/** bKash tokenized checkout: grant token, create, execute, query payment. */
export class BkashGateway implements PaymentGateway {
  readonly name = 'bkash' as const;
  private readonly logger = new Logger('bKash');
  private readonly base: string;

  constructor(
    private readonly opts: BkashOptions,
    private readonly redis: RedisService,
  ) {
    this.base = opts.live
      ? 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout'
      : 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout';
  }

  private async idToken(): Promise<string> {
    const cached = await this.redis.client.get(TOKEN_KEY);
    if (cached) return cached;
    const res = await this.post<BkashReply>(
      '/token/grant',
      { app_key: this.opts.appKey, app_secret: this.opts.appSecret },
      { username: this.opts.username, password: this.opts.password },
    );
    if (!res.id_token) throw new Error('BKASH_AUTH_FAILED');
    const ttl = Math.max(60, (res.expires_in ?? 3600) - 120);
    await this.redis.client.set(TOKEN_KEY, res.id_token, 'EX', ttl);
    return res.id_token;
  }

  private async post<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return (await res.json()) as T;
  }

  private async authed<T>(path: string, body: unknown): Promise<T> {
    return this.post<T>(path, body, {
      Authorization: await this.idToken(),
      'X-APP-Key': this.opts.appKey,
    });
  }

  async create(o: GatewayOrder): Promise<CreatedPayment> {
    const res = await this.authed<BkashReply>('/create', {
      mode: '0011',
      payerReference: o.customer.phone,
      callbackURL: o.returnUrl,
      amount: o.amountBdt.toFixed(2),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: o.merchantTranId,
    });
    if (res.statusCode !== '0000' || !res.bkashURL || !res.paymentID) {
      this.logger.warn(`create failed: ${res.statusCode} ${res.statusMessage}`);
      throw new Error('BKASH_CREATE_FAILED');
    }
    return {
      redirectUrl: res.bkashURL,
      gatewayRef: res.paymentID,
      raw: { paymentID: res.paymentID },
    };
  }

  async verify(p: StoredPayment, hint: Record<string, string>): Promise<Verdict> {
    if (!p.gatewayRef) return { state: 'pending', raw: { reason: 'no paymentID yet' } };
    if (hint['status'] === 'cancel') return { state: 'cancelled', raw: { hint } };
    if (hint['status'] === 'failure') return { state: 'failed', raw: { hint } };

    // The customer approved: execute (captures the money). A repeat execute errors, so fall
    // through to query, which is the source of truth either way.
    if (hint['status'] === 'success') {
      await this.authed<BkashReply>('/execute', { paymentID: p.gatewayRef }).catch(() => undefined);
    }
    const q = await this.authed<BkashReply>('/payment/status', { paymentID: p.gatewayRef });
    if (q.transactionStatus === 'Completed' && q.trxID) {
      if (q.merchantInvoiceNumber === p.merchantTranId && Number(q.amount) === p.amountBdt) {
        return { state: 'paid', gatewayTranId: q.trxID, raw: q };
      }
      this.logger.error(`amount/invoice mismatch for payment ${p.id}: ${JSON.stringify(q)}`);
      return { state: 'failed', raw: q };
    }
    if (q.transactionStatus === 'Cancelled') return { state: 'cancelled', raw: q };
    if (q.transactionStatus === 'Failed' || q.statusCode === '2056')
      return { state: 'failed', raw: q };
    return { state: 'pending', raw: q };
  }
}
