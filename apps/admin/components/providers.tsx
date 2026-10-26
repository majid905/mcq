'use client';

import type { ApiClient } from '@mcq/api-client-ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { createBrowserApiClient } from '@/lib/api';
import { makeQueryClient } from '@/lib/query-client';

const ApiContext = createContext<ApiClient | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const [queryClient] = useState(makeQueryClient);
  const api = useMemo(
    () =>
      createBrowserApiClient(locale, {
        onSessionLost: () => {
          queryClient.clear();
          const next = window.location.pathname + window.location.search;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        },
      }),
    [locale, router, queryClient],
  );
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <Providers>');
  return api;
}
