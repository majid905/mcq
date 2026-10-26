import type { NextRequest } from 'next/server';
import { UPSTREAM_BASE } from './config';

/** Request headers the API cares about (docs/04-API.md section 1). Cookies never go upstream. */
export function upstreamHeaders(req: NextRequest, accessToken?: string): Headers {
  const h = new Headers();
  for (const name of ['accept-language', 'content-type', 'user-agent', 'x-request-id']) {
    const v = req.headers.get(name);
    if (v) h.set(name, v);
  }
  if (!h.has('x-request-id')) h.set('x-request-id', crypto.randomUUID());
  h.set('accept', 'application/json');
  h.set('x-platform', 'web');
  h.set('x-client', 'admin');
  // The API trusts the proxy in front of it (TRUST_PROXY) for per-IP rate limits.
  const forwarded = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  if (forwarded) h.set('x-forwarded-for', forwarded);
  if (accessToken) h.set('authorization', `Bearer ${accessToken}`);
  return h;
}

/** Response headers passed back to the browser. */
const PASS_BACK = [
  'content-disposition',
  'content-type',
  'x-request-id',
  'x-server-time',
  'retry-after',
  'cache-control',
];

export function browserHeaders(upstream: Response): Headers {
  const h = new Headers();
  for (const name of PASS_BACK) {
    const v = upstream.headers.get(name);
    if (v) h.set(name, v);
  }
  return h;
}

export async function callUpstream(
  path: string,
  init: { method: string; headers: Headers; body?: string },
): Promise<Response> {
  return fetch(`${UPSTREAM_BASE}/${path}`, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    cache: 'no-store',
    redirect: 'manual',
  });
}

export function errorEnvelope(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } });
}

export function errorCode(body: unknown): string | undefined {
  return (body as { error?: { code?: string } } | null)?.error?.code;
}
