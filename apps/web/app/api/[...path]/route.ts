import { type NextRequest, NextResponse } from 'next/server';
import { SECURE_COOKIES } from '@/lib/server/config';
import {
  VERIFICATION_PATH,
  clearSessionCookies,
  clearVerificationCookie,
  refreshSession,
  setSessionCookies,
  splitAuthSession,
} from '@/lib/server/session';
import {
  browserHeaders,
  callUpstream,
  errorCode,
  errorEnvelope,
  upstreamHeaders,
} from '@/lib/server/upstream';
import { COOKIES, CSRF_HEADER, VERIFICATION_MAX_AGE } from '@/lib/session-cookies';

/**
 * BFF for the student web (docs/04-API.md section 2): the browser calls /api/<path>, this handler
 * forwards to the API with the bearer token from the httpOnly `at` cookie, keeps tokens out of
 * JavaScript, checks the double-submit CSRF header on mutations and refreshes once on 401.
 */
export const dynamic = 'force-dynamic';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Admin has its own BFF; webhooks are server-to-server. */
const BLOCKED = [/^admin(\/|$)/, /^payments\/webhooks(\/|$)/];

type Ctx = { params: Promise<{ path: string[] }> };

function json(status: number, body: string, headers?: Headers): NextResponse {
  const h = headers ?? new Headers();
  if (!h.has('content-type')) h.set('content-type', 'application/json');
  return new NextResponse(status === 204 ? null : body, { status, headers: h });
}

function deviceInfo(req: NextRequest) {
  return {
    device_id: req.cookies.get(COOKIES.device)?.value ?? crypto.randomUUID(),
    platform: 'web' as const,
    // The API caps device.model at 100 characters.
    model: (req.headers.get('user-agent') ?? 'browser').slice(0, 100),
  };
}

/** Adds server-held values to auth request bodies: device info and the OTP verification token. */
function rewriteAuthBody(
  path: string,
  req: NextRequest,
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  if (path === 'auth/login' || path === 'auth/register') body.device = deviceInfo(req);
  if (path === 'auth/register' || path === 'auth/password/reset') {
    const vt = req.cookies.get(COOKIES.verification)?.value;
    if (vt) body.verification_token = vt;
  }
  return JSON.stringify(body);
}

async function readJson(res: Response): Promise<{ text: string; body: unknown }> {
  const text = await res.text();
  try {
    return { text, body: text ? (JSON.parse(text) as unknown) : null };
  } catch {
    return { text, body: null };
  }
}

async function handle(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const path = (await ctx.params).path.map(encodeURIComponent).join('/');
  if (BLOCKED.some((re) => re.test(path))) {
    return json(404, errorEnvelope('NOT_FOUND', 'Not found'));
  }

  if (MUTATING.has(req.method)) {
    const cookie = req.cookies.get(COOKIES.csrf)?.value;
    if (!cookie || req.headers.get(CSRF_HEADER) !== cookie) {
      return json(403, errorEnvelope('FORBIDDEN', 'CSRF token missing or invalid'));
    }
  }

  const raw = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const body = path.startsWith('auth/') ? rewriteAuthBody(path, req, raw) : raw;
  const target = `${path}${req.nextUrl.search}`;
  const refreshToken = req.cookies.get(COOKIES.refresh)?.value;

  // The browser never sees the refresh token, so /auth/refresh uses the cookie.
  if (path === 'auth/refresh') {
    if (!refreshToken) return json(401, errorEnvelope('UNAUTHENTICATED', 'Not signed in'));
    const result = await refreshSession(refreshToken, upstreamHeaders(req));
    if (!result.ok) {
      const res = json(result.status, JSON.stringify(result.body ?? {}));
      clearSessionCookies(res.cookies);
      return res;
    }
    const split = splitAuthSession(result.body);
    const res = json(200, JSON.stringify(split?.publicBody ?? { data: {} }));
    setSessionCookies(res.cookies, result.tokens);
    return res;
  }

  let accessToken = req.cookies.get(COOKIES.access)?.value;
  let refreshed: Awaited<ReturnType<typeof refreshSession>> | null = null;
  // Public auth calls never need a session; logout does, so the server-side session really ends.
  const canRefresh = !path.startsWith('auth/') || path === 'auth/logout';

  // Access cookie expired (its maxAge is the token lifetime) but the session is still alive.
  if (!accessToken && refreshToken && canRefresh) {
    refreshed = await refreshSession(refreshToken, upstreamHeaders(req));
    if (refreshed.ok) accessToken = refreshed.tokens.access_token;
  }

  let upstream: Response;
  try {
    upstream = await callUpstream(target, {
      method: req.method,
      headers: upstreamHeaders(req, accessToken),
      body,
    });
    if (upstream.status === 401 && refreshToken && canRefresh && !refreshed) {
      refreshed = await refreshSession(refreshToken, upstreamHeaders(req));
      if (refreshed.ok) {
        upstream = await callUpstream(target, {
          method: req.method,
          headers: upstreamHeaders(req, refreshed.tokens.access_token),
          body,
        });
      }
    }
  } catch {
    return json(502, errorEnvelope('INTERNAL_ERROR', 'API unreachable'));
  }

  const { text, body: parsed } = await readJson(upstream);
  const headers = browserHeaders(upstream);

  // Login and register: tokens go into cookies, only the user goes to the browser.
  if ((path === 'auth/login' || path === 'auth/register') && upstream.ok) {
    const split = splitAuthSession(parsed);
    const res = json(upstream.status, JSON.stringify(split?.publicBody ?? parsed), headers);
    if (split) setSessionCookies(res.cookies, split.tokens);
    clearVerificationCookie(res.cookies);
    return res;
  }

  // OTP verify: keep the verification token server-side until register / password reset.
  if (path === 'auth/otp/verify' && upstream.ok) {
    const vt = (parsed as { data?: { verification_token?: string } } | null)?.data
      ?.verification_token;
    const res = json(200, JSON.stringify({ data: { verified: true } }), headers);
    if (vt) {
      res.cookies.set(COOKIES.verification, vt, {
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'strict',
        path: VERIFICATION_PATH,
        maxAge: VERIFICATION_MAX_AGE,
      });
    }
    return res;
  }

  // Signed out by another device: pass that code on so the browser shows B10, not the login form.
  const revokedBody =
    upstream.status === 401 &&
    refreshed &&
    !refreshed.ok &&
    errorCode(refreshed.body) === 'SESSION_REVOKED'
      ? refreshed.body
      : null;
  const res = revokedBody
    ? json(401, JSON.stringify(revokedBody), headers)
    : json(upstream.status, text, headers);
  if (path === 'auth/password/reset' && upstream.ok) clearVerificationCookie(res.cookies);
  if (path === 'auth/logout') {
    clearSessionCookies(res.cookies);
    return res;
  }
  if (refreshed?.ok) setSessionCookies(res.cookies, refreshed.tokens);
  else if (refreshed && !refreshed.ok) clearSessionCookies(res.cookies);
  else if (upstream.status === 401 && errorCode(parsed) === 'SESSION_REVOKED') {
    clearSessionCookies(res.cookies);
  }
  return res;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
