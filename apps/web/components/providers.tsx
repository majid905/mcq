'use client';

import type { ApiClient } from '@mcq/api-client-ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { createBrowserApiClient } from '@/lib/api';
import { Paywall, type PaywallState } from './billing/paywall';
import { makeQueryClient } from '@/lib/query-client';

const ApiContext = createContext<ApiClient | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const [queryClient] = useState(makeQueryClient);
  const [paywall, setPaywall] = useState<PaywallState | null>(null);
  const api = useMemo(
    () =>
      createBrowserApiClient(locale, {
        onSessionLost: (code) => {
          queryClient.clear();
          if (code === 'SESSION_REVOKED') router.replace('/device-limit');
          else {
            const next = window.location.pathname.replace(/^\/en(?=\/|$)/, '') || '/home';
            router.replace({ pathname: '/login', query: { next } });
          }
        },
        onMaintenance: () => router.replace('/maintenance'),
        onPaywall: (code, details) => setPaywall({ code: code as PaywallState['code'], details }),
      }),
    [locale, router, queryClient],
  );
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Paywall state={paywall} onClose={() => setPaywall(null)} />
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}

/** Typed API client (through the BFF) for the active locale. */
export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <Providers>');
  return api;
}
