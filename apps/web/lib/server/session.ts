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

interface Inflight {
  promise: Promise<RefreshResult>;
}

/**
 * Refresh tokens rotate on every use and reuse revokes the session (docs/10 section 6), so each
 * refresh token is exchanged at most once. Concurrent requests carrying the same token share one
 * upstream call, and the result is kept for 30 s so a request that still carries the old cookie
 * (sent before the browser stored the new one) gets the new tokens instead of a reuse.
 * Lives on globalThis so middleware and route handlers in the same process share it.
 * One web instance per session is assumed; a multi-instance deploy needs sticky sessions or Redis.
 */
const KEEP_MS = 30_000;
const store = globalThis as typeof globalThis & { __mcqRefresh?: Map<string, Inflight> };
const inflight = (store.__mcqRefresh ??= new Map<string, Inflight>());

async function callRefresh(refreshToken: string, headers: HeadersInit): Promise<RefreshResult> {
  try {
    const res = await fetch(`${UPSTREAM_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { ...Object.fromEntries(new Headers(headers)), 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => null);
    const data = (body as { data?: Partial<SessionTokens> } | null)?.data;
    if (res.ok && data?.access_token && data.refresh_token) {
      return {
        ok: true,
        body,
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          access_expires_in: data.access_expires_in ?? 900,
        },
      };
    }
    return { ok: false, status: res.status, body };
  } catch {
    return { ok: false, status: 502, body: null };
  }
}

export function refreshSession(refreshToken: string, headers: HeadersInit): Promise<RefreshResult> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing.promise;
  const promise = callRefresh(refreshToken, headers);
  inflight.set(refreshToken, { promise });
  void promise.finally(() => {
    setTimeout(() => inflight.delete(refreshToken), KEEP_MS).unref?.();
  });
  return promise;
}

export function setSessionCookies(cookies: ResponseCookies, tokens: SessionTokens): void {
  const base = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax' as const, path: '/' };
  cookies.set(COOKIES.access, tokens.access_token, { ...base, maxAge: tokens.access_expires_in });
  cookies.set(COOKIES.refresh, tokens.refresh_token, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function clearSessionCookies(cookies: ResponseCookies): void {
  cookies.delete(COOKIES.access);
  cookies.delete(COOKIES.refresh);
  clearVerificationCookie(cookies);
}

/** The OTP verification token is only sent to /api/auth/*. */
export const VERIFICATION_PATH = '/api/auth';

export function clearVerificationCookie(cookies: ResponseCookies): void {
  cookies.set(COOKIES.verification, '', { path: VERIFICATION_PATH, maxAge: 0 });
}

/** Pulls the tokens out of an AuthSession envelope so they never reach the browser. */
export function splitAuthSession(
  body: unknown,
): { tokens: SessionTokens; publicBody: unknown } | null {
  const data = (body as { data?: Partial<SessionTokens> & { user?: unknown } } | null)?.data;
  if (!data?.access_token || !data.refresh_token) return null;
  return {
    tokens: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      access_expires_in: data.access_expires_in ?? 900,
    },
    publicBody: { data: { user: data.user } },
  };
}
