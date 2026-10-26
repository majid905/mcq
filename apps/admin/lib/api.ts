import { type ApiClient, createApiClient } from '@mcq/api-client-ts';
import { COOKIES, CSRF_HEADER } from './session-cookies';

/** Browser requests go through the admin BFF (app/api/[...path]); it holds the tokens. */
export const BFF_BASE = '/api';

export interface ApiEvents {
  /** 401 outside /admin/auth/*: the BFF could not refresh the admin session. */
  onSessionLost?: (code: string) => void;
  /** 503 MAINTENANCE (admin routes stay open during maintenance, so this is rare). */
  onMaintenance?: () => void;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function errorOf(
  response: Response,
): Promise<{ code?: string; details: Record<string, unknown> }> {
  try {
    const body = (await response.clone().json()) as {
      error?: { code?: string; details?: Record<string, unknown> };
    };
    return { code: body.error?.code, details: body.error?.details ?? {} };
  } catch {
    return { details: {} };
  }
}

export function createBrowserApiClient(locale: string, events: ApiEvents = {}): ApiClient {
  const client = createApiClient(BFF_BASE);
  client.use({
    onRequest({ request }) {
      request.headers.set('Accept-Language', locale);
      const csrf = readCookie(COOKIES.csrf);
      if (csrf) request.headers.set(CSRF_HEADER, csrf);
      return request;
    },
    async onResponse({ request, response }) {
      const path = new URL(request.url).pathname;
      if (response.status === 401 && !path.startsWith(`${BFF_BASE}/admin/auth/`)) {
        events.onSessionLost?.((await errorOf(response)).code ?? 'UNAUTHENTICATED');
      } else if (response.status === 503 && (await errorOf(response)).code === 'MAINTENANCE') {
        events.onMaintenance?.();
      }
      return response;
    },
  });
  return client;
}

interface FetchResult<T> {
  data?: { data?: T };
  error?: unknown;
  response: Response;
}

function toApiError(error: unknown, response: Response): ApiError {
  const e = (error as { error?: { code?: string; message?: string; details?: unknown } } | null)
    ?.error;
  const retry = Number(response.headers.get('retry-after'));
  return new ApiError(
    response.status,
    e?.code ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN'),
    e?.message ?? response.statusText,
    (e?.details as Record<string, unknown> | undefined) ?? {},
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

/** Returns `data` from the envelope or throws ApiError (code, localized message, details). */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  const { data, error, response } = result;
  if (!response.ok || data?.data === undefined) {
    if (response.ok) throw new ApiError(response.status, 'EMPTY', 'Empty response');
    throw toApiError(error, response);
  }
  return data.data;
}

/** For 204 endpoints. */
export async function expectOk(
  call: Promise<{ error?: unknown; response: Response }>,
): Promise<void> {
  let result: { error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  if (!result.response.ok) throw toApiError(result.error, result.response);
}
