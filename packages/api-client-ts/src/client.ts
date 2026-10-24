import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths } from './generated/schema';

/**
 * Typed API client. `baseUrl` includes the version prefix, e.g.
 * `http://localhost:4010/v1` (Prism mock) or `https://api.example.com/v1`.
 */
export function createApiClient(baseUrl: string, options: Omit<ClientOptions, 'baseUrl'> = {}) {
  return createClient<paths>({ baseUrl, ...options });
}

export type ApiClient = ReturnType<typeof createApiClient>;
