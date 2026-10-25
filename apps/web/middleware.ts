import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { isGuestOnlyPath, isProtectedPath, splitLocalePath } from './lib/routes';
import { SECURE_COOKIES } from './lib/server/config';
import {
  type RefreshResult,
  clearSessionCookies,
  refreshSession,
  setSessionCookies,
} from './lib/server/session';
import { errorCode, upstreamHeaders } from './lib/server/upstream';
import { COOKIES } from './lib/session-cookies';

const intl = createMiddleware(routing);

/** Stable per-browser device id (one active browser per account) and the CSRF double-submit token. */
function ensureBrowserCookies(req: NextRequest, res: NextResponse): void {
  if (!req.cookies.get(COOKIES.device)) {
    res.cookies.set(COOKIES.device, crypto.randomUUID(), {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
  }
  if (!req.cookies.get(COOKIES.csrf)) {
    res.cookies.set(COOKIES.csrf, crypto.randomUUID().replace(/-/g, ''), {
      httpOnly: false,
      secure: SECURE_COOKIES,
      sameSite: 'strict',
      path: '/',
    });
  }
}

function redirect(req: NextRequest, to: string, next?: string): NextResponse {
  const url = new URL(to, req.url);
  if (next) url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const { prefix, path } = splitLocalePath(pathname);
  const hasAccess = Boolean(req.cookies.get(COOKIES.access)?.value);
  const refreshToken = req.cookies.get(COOKIES.refresh)?.value;

  let refreshed: RefreshResult | null = null;
  if (isProtectedPath(path) && !hasAccess) {
    if (refreshToken) refreshed = await refreshSession(refreshToken, upstreamHeaders(req));
    if (!refreshed?.ok) {
      const revoked = refreshed && errorCode(refreshed.body) === 'SESSION_REVOKED';
      const res = revoked
        ? redirect(req, `${prefix}/device-limit`)
        : redirect(req, `${prefix}/login`, `${pathname}${search}`);
      if (refreshed) clearSessionCookies(res.cookies);
      ensureBrowserCookies(req, res);
      return res;
    }
  } else if (isGuestOnlyPath(path) && (hasAccess || refreshToken)) {
    const res = redirect(req, `${prefix}/home`);
    ensureBrowserCookies(req, res);
    return res;
  }

  const res = intl(req);
  if (refreshed?.ok) setSessionCookies(res.cookies, refreshed.tokens);
  ensureBrowserCookies(req, res);
  return res;
}

export const config = {
  // Node runtime: shares the refresh de-duplication map with the /api route handlers.
  runtime: 'nodejs',
  // Everything except API routes, Next internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
