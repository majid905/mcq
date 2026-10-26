import { type NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookies,
  refreshSession,
  setSessionCookies,
  splitAdminSession,
} from '@/lib/server/session';
import {
  browserHeaders,
  callUpstream,
  errorEnvelope,
  upstreamHeaders,
} from '@/lib/server/upstream';
import { COOKIES, CSRF_HEADER } from '@/lib/session-cookies';

/**
 * Admin BFF: /api/admin/* → API /v1/admin/*, with the admin bearer from the httpOnly adm_at
 * cookie, CSRF on mutations and one refresh on 401. Student endpoints are not reachable here.
 */
export const dynamic = 'force-dynamic';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED = [/^admin(\/|$)/, /^settings\/public$/, /^health$/, /^taxonomy$/, /^packages$/];

type Ctx = { params: Promise<{ path: string[] }> };

function json(status: number, body: string | null, headers?: Headers): NextResponse {
  const h = headers ?? new Headers();
  if (!h.has('content-type')) h.set('content-type', 'application/json');
  return new NextResponse(status === 204 ? null : body, { status, headers: h });
}

async function handle(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const path = (await ctx.params).path.map(encodeURIComponent).join('/');
  if (!ALLOWED.some((re) => re.test(path))) {
    return json(404, errorEnvelope('NOT_FOUND', 'Not found'));
  }
  if (MUTATING.has(req.method)) {
    const cookie = req.cookies.get(COOKIES.csrf)?.value;
    if (!cookie || req.headers.get(CSRF_HEADER) !== cookie) {
      return json(403, errorEnvelope('FORBIDDEN', 'CSRF token missing or invalid'));
    }
  }

  const isAuth = path.startsWith('admin/auth/');
  const refreshToken = req.cookies.get(COOKIES.refresh)?.value;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  const target = `${path}${req.nextUrl.search}`;

  // Logout needs the refresh token in the body; the browser never has it.
  const upstreamBody =
    path === 'admin/auth/logout' ? JSON.stringify({ refresh_token: refreshToken ?? '' }) : body;

  let accessToken = req.cookies.get(COOKIES.access)?.value;
  let refreshed: Awaited<ReturnType<typeof refreshSession>> | null = null;
  const canRefresh = !isAuth || path === 'admin/auth/logout' || path.startsWith('admin/auth/totp');
  if (!accessToken && refreshToken && canRefresh) {
    refreshed = await refreshSession(refreshToken, upstreamHeaders(req));
    if (refreshed.ok) accessToken = refreshed.tokens.access_token;
  }

  let upstream: Response;
  try {
    const headers = upstreamHeaders(req, accessToken);
    if (path === 'admin/auth/logout') headers.set('content-type', 'application/json');
    upstream = await callUpstream(target, { method: req.method, headers, body: upstreamBody });
    if (upstream.status === 401 && refreshToken && canRefresh && !refreshed) {
      refreshed = await refreshSession(refreshToken, upstreamHeaders(req));
      if (refreshed.ok) {
        upstream = await callUpstream(target, {
          method: req.method,
          headers: upstreamHeaders(req, refreshed.tokens.access_token),
          body: upstreamBody,
        });
      }
    }
  } catch {
    return json(502, errorEnvelope('INTERNAL_ERROR', 'API unreachable'));
  }

  const headers = browserHeaders(upstream);
  // Binary bodies (exports, templates) pass through untouched.
  if (!(upstream.headers.get('content-type') ?? '').includes('json') && upstream.status !== 204) {
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  const text = await upstream.text();

  if (path === 'admin/auth/login' && upstream.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through with the raw text
    }
    const split = splitAdminSession(parsed);
    const res = json(upstream.status, JSON.stringify(split?.publicBody ?? parsed), headers);
    if (split) setSessionCookies(res.cookies, split.tokens);
    return res;
  }

  const res = json(upstream.status, text, headers);
  if (path === 'admin/auth/logout') {
    clearSessionCookies(res.cookies);
    return res;
  }
  if (refreshed?.ok) setSessionCookies(res.cookies, refreshed.tokens);
  else if (refreshed && !refreshed.ok) clearSessionCookies(res.cookies);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
