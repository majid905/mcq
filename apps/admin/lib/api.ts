import { type ApiClient, createApiClient } from '@mcq/api-client-ts';

/** Prism mock by default; point at the real API with NEXT_PUBLIC_API_BASE only (never in code). */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4010/v1';

/** Client that sends the headers every request needs (docs/04-API.md): language and platform. */
export function createWebApiClient(locale: string, baseUrl: string = API_BASE): ApiClient {
  const client = createApiClient(baseUrl);
  client.use({
    onRequest({ request }) {
      request.headers.set('Accept-Language', locale);
      request.headers.set('X-Platform', 'web');
      return request;
    },
  });
  return client;
}
