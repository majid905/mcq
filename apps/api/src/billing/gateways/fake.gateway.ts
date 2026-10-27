import type {
  CreatedPayment,
  GatewayName,
  GatewayOrder,
  PaymentGateway,
  StoredPayment,
  Verdict,
} from './payment-gateway';

/**
 * Development and test driver: no money moves. The "gateway page" is our own return URL with
 * `fake=paid`. The hint decides the verdict, so it must never run with NODE_ENV=production
 * (env validation refuses that).
 */
export class FakeGateway implements PaymentGateway {
  constructor(readonly name: GatewayName) {}

  create(order: GatewayOrder): Promise<CreatedPayment> {
    const sep = order.returnUrl.includes('?') ? '&' : '?';
    return Promise.resolve({
      redirectUrl: `${order.returnUrl}${sep}fake=paid`,
      gatewayRef: `FAKE-${order.merchantTranId}`,
      raw: { fake: true },
    });
  }

  verify(payment: StoredPayment, hint: Record<string, string>): Promise<Verdict> {
    const raw = { fake: true, hint };
    switch (hint['fake']) {
      case 'paid':
        return Promise.resolve({
          state: 'paid',
          gatewayTranId: `FAKETRX${payment.id}`,
          raw,
        });
      case 'failed':
        return Promise.resolve({ state: 'failed', raw });
      case 'cancelled':
        return Promise.resolve({ state: 'cancelled', raw });
      default:
        return Promise.resolve({ state: 'pending', raw });
    }
  }
}
