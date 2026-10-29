'use client';

import type { components } from '@mcq/api-client-ts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useApi } from '@/components/providers';
import { unwrap } from '@/lib/api';

export type Package = components['schemas']['Package'];
export type Payment = components['schemas']['Payment'];
export type Gateway = 'bkash' | 'sslcommerz';

const TERMINAL: Payment['status'][] = ['paid', 'failed', 'cancelled', 'refunded'];

export const billingKeys = {
  packages: ['packages'] as const,
  payment: (id: string) => ['payment', id] as const,
  history: ['payments', 'history'] as const,
  session: ['session'] as const,
};

/** Signed in or not, without a 401 (see app/api/session). */
export function useSignedIn() {
  return useQuery({
    queryKey: billingKeys.session,
    queryFn: async () => {
      const res = await fetch('/api/session', { cache: 'no-store' });
      const body = (await res.json()) as { data?: { signed_in?: boolean } };
      return Boolean(body.data?.signed_in);
    },
    staleTime: 60_000,
  });
}

export function usePackages() {
  const api = useApi();
  return useQuery({
    queryKey: billingKeys.packages,
    queryFn: () => unwrap(api.GET('/packages')),
    staleTime: 5 * 60_000,
  });
}

export function useValidateCoupon() {
  const api = useApi();
  return useMutation({
    mutationFn: (v: { code: string; packageId: string }) =>
      unwrap(
        api.POST('/coupons/validate', { body: { code: v.code.trim(), package_id: v.packageId } }),
      ),
  });
}

export function useCheckout() {
  const api = useApi();
  return useMutation({
    mutationFn: (v: { packageId: string; gateway: Gateway; coupon?: string }) =>
      unwrap(
        api.POST('/payments/checkout', {
          body: {
            package_id: v.packageId,
            gateway: v.gateway,
            return_platform: 'web',
            ...(v.coupon ? { coupon_code: v.coupon } : {}),
          },
        }),
      ),
  });
}

/** Polls every 3 s for up to 2 minutes while the gateway result is not final (I3). */
export function usePayment(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: billingKeys.payment(id),
    queryFn: () => unwrap(api.GET('/payments/{id}', { params: { path: { id } } })),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status && TERMINAL.includes(status)) return false;
      return q.state.dataUpdateCount < 40 ? 3_000 : false;
    },
  });
}

export function usePaymentHistory() {
  const api = useApi();
  return useQuery({
    queryKey: billingKeys.history,
    queryFn: () => unwrap(api.GET('/payments/history')),
  });
}

export { perMonth } from './price';
