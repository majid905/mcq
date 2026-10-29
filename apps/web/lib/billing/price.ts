import type { components } from '@mcq/api-client-ts';

/** Monthly equivalent for "৳১৫০/মাস" lines. Plain module so server components can use it too. */
export function perMonth(p: components['schemas']['Package']): number {
  const months = Math.max(1, Math.round((p.duration_days ?? 30) / 30));
  return Math.round((p.price_bdt ?? 0) / months);
}
