'use client';

import type { ApiClient } from '@mcq/api-client-ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { createWebApiClient } from '@/lib/api';
import { makeQueryClient } from '@/lib/query-client';

const ApiContext = createContext<ApiClient | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [queryClient] = useState(makeQueryClient);
  const api = useMemo(() => createWebApiClient(locale), [locale]);
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

/** Typed API client for the active locale. */
export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <Providers>');
  return api;
}
