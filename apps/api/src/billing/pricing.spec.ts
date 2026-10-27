import { discountFor, payable } from './pricing';

describe('pricing', () => {
  it('applies a percent coupon', () => {
    expect(discountFor(899, { type: 'percent', value: 10, maxDiscountBdt: null })).toBe(89.9);
    expect(payable(899, 89.9)).toBe(809.1);
  });

  it('caps a percent coupon at max_discount_bdt', () => {
    expect(discountFor(1499, { type: 'percent', value: 50, maxDiscountBdt: 200 })).toBe(200);
  });

  it('applies a fixed coupon but never beyond the price', () => {
    expect(discountFor(199, { type: 'fixed', value: 50, maxDiscountBdt: null })).toBe(50);
    expect(discountFor(199, { type: 'fixed', value: 500, maxDiscountBdt: null })).toBe(199);
    expect(payable(199, 199)).toBe(0);
  });

  it('does not drift on awkward percentages', () => {
    expect(discountFor(199, { type: 'percent', value: 33, maxDiscountBdt: null })).toBe(65.67);
    expect(discountFor(0.1, { type: 'percent', value: 100, maxDiscountBdt: null })).toBe(0.1);
  });
});
