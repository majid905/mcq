import type { NextResponse } from 'next/server';
import { COOKIES, REFRESH_MAX_AGE } from '../session-cookies';
import { SECURE_COOKIES, UPSTREAM_BASE } from './config';

type ResponseCookies = NextResponse['cookies'];

export interface SessionTokens {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
}

export type RefreshResult =
  { ok: true; tokens: SessionTokens; body: unknown } | { ok: false; status: number; body: unknown };

/**
 * Same single-flight refresh as apps/web: each admin refresh token is exchanged once, concurrent
 * requests share the result for 30 s (rotation + reuse detection on the API).
 */
const KEEP_MS = 30_000;
const store = globalThis as typeof globalThis & {
  __mcqAdminRefresh?: Map<string, Promise<RefreshResult>>;
};
const inflight = (store.__mcqAdminRefresh ??= new Map<string, Promise<RefreshResult>>());

function tokensOf(body: unknown): SessionTokens | null {
  const data = (body as { data?: Partial<SessionTokens> } | null)?.data;
  if (!data?.access_token || !data.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    access_expires_in: data.access_expires_in ?? 900,
  };
}

async function callRefresh(refreshToken: string, headers: Headers): Promise<RefreshResult> {
  try {
    const h = new Headers(headers);
    h.set('content-type', 'application/json');
    const res = await fetch(`${UPSTREAM_BASE}/admin/auth/refresh`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => null);
    const tokens = res.ok ? tokensOf(body) : null;
    return tokens ? { ok: true, tokens, body } : { ok: false, status: res.status, body };
  } catch {
    return { ok: false, status: 502, body: null };
  }
}

export function refreshSession(refreshToken: string, headers: Headers): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;
  const promise = callRefresh(refreshToken, headers);
  inflight.set(refreshToken, promise);
  void promise.finally(() => {
    setTimeout(() => inflight.delete(refreshToken), KEEP_MS).unref?.();
  });
  return promise;
}

export function setSessionCookies(cookies: ResponseCookies, tokens: SessionTokens): void {
  const base = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'strict' as const, path: '/' };
  cookies.set(COOKIES.access, tokens.access_token, { ...base, maxAge: tokens.access_expires_in });
  cookies.set(COOKIES.refresh, tokens.refresh_token, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function clearSessionCookies(cookies: ResponseCookies): void {
  cookies.delete(COOKIES.access);
  cookies.delete(COOKIES.refresh);
}

/** Tokens go to cookies; only the admin profile goes to the browser. */
export function splitAdminSession(
  body: unknown,
): { tokens: SessionTokens; publicBody: unknown } | null {
  const tokens = tokensOf(body);
  if (!tokens) return null;
  const admin = (body as { data?: { admin?: unknown } }).data?.admin;
  return { tokens, publicBody: { data: { admin } } };
}
