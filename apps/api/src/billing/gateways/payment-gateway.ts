export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

export type GatewayName = 'bkash' | 'sslcommerz';

/** What a gateway needs to start a payment. Amounts are BDT after discount. */
export interface GatewayOrder {
  paymentId: bigint;
  /** Our ULID, unique per payment; the gateway echoes it back. */
  merchantTranId: string;
  amountBdt: number;
  productName: string;
  customer: { id: bigint; name: string; phone: string };
  /** Browser return URL (success, fail and cancel all land here; the server re-checks with the gateway). */
  returnUrl: string;
  /** Server-to-server notification URL. */
  ipnUrl: string;
}

export interface CreatedPayment {
  redirectUrl: string;
  /** The gateway's own handle when it hands one out at creation (bKash paymentID). */
  gatewayRef?: string;
  /** Kept in `payments.gateway_payload` for support. */
  raw?: unknown;
}

/** The stored payment row, as far as verification needs it. */
export interface StoredPayment {
  id: bigint;
  merchantTranId: string;
  amountBdt: number;
  gatewayRef: string | null;
}

export type Verdict =
  | { state: 'paid'; gatewayTranId: string; raw: unknown }
  | { state: 'failed' | 'cancelled'; raw: unknown }
  | { state: 'pending'; raw: unknown };

/**
 * FR-PAY-02 / FR-PAY-06. `verify` must ask the gateway's own API; the `hint` (query/form fields the
 * browser or IPN sent) is untrusted and only tells the driver what to look up or which flow ended.
 */
export interface PaymentGateway {
  readonly name: GatewayName;
  create(order: GatewayOrder): Promise<CreatedPayment>;
  verify(payment: StoredPayment, hint: Record<string, string>): Promise<Verdict>;
}
