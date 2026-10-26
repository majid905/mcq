import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry network and 5xx once; client errors (401, 404, 402...) are final.
        retry: (count, error) =>
          count < 1 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
      },
    },
  });
}
