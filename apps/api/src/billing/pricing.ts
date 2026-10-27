export interface CouponRule {
  type: 'percent' | 'fixed';
  value: number;
  maxDiscountBdt: number | null;
}

/** BDT as whole paisa so percentages never accumulate float error. */
const paisa = (bdt: number): number => Math.round(bdt * 100);

/**
 * FR-PAY-03. Discount in BDT for `price` under one coupon: percent is capped by `max_discount_bdt`,
 * and no coupon can take the price below zero.
 */
export function discountFor(priceBdt: number, rule: CouponRule): number {
  const price = paisa(priceBdt);
  let off = rule.type === 'percent' ? Math.floor((price * rule.value) / 100) : paisa(rule.value);
  if (rule.type === 'percent' && rule.maxDiscountBdt !== null) {
    off = Math.min(off, paisa(rule.maxDiscountBdt));
  }
  return Math.min(Math.max(off, 0), price) / 100;
}

export const payable = (priceBdt: number, discountBdt: number): number =>
  (paisa(priceBdt) - paisa(discountBdt)) / 100;
