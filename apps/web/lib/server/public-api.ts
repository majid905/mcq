import { createApiClient } from '@mcq/api-client-ts';
import { UPSTREAM_BASE } from './config';

/**
 * Server-side client for public, cacheable endpoints (landing, SEO pages). No cookies, no
 * session: anything user-specific goes through the BFF instead.
 */
export function publicApi(locale: string, revalidateSec = 300) {
  return createApiClient(UPSTREAM_BASE, {
    headers: { 'Accept-Language': locale, 'X-Platform': 'web' },
    fetch: (req: Request) => fetch(req, { next: { revalidate: revalidateSec } }),
  });
}

/** `data` of a public call, or null when the API is down (pages still render). */
export async function publicData<T>(
  call: Promise<{ data?: { data?: T }; response: Response }>,
): Promise<T | null> {
  try {
    const { data, response } = await call;
    return response.ok ? (data?.data ?? null) : null;
  } catch {
    return null;
  }
}
