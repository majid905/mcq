import { type NextRequest, NextResponse } from 'next/server';
import { SECURE_COOKIES } from './lib/server/config';
import { clearSessionCookies, refreshSession, setSessionCookies } from './lib/server/session';
import { upstreamHeaders } from './lib/server/upstream';
import { COOKIES } from './lib/session-cookies';

/** Every admin page needs a session except these. */
const PUBLIC = ['/login', '/dev/gallery'];

function ensureCsrf(req: NextRequest, res: NextResponse): void {
  if (!req.cookies.get(COOKIES.csrf)) {
    res.cookies.set(COOKIES.csrf, crypto.randomUUID().replace(/-/g, ''), {
      httpOnly: false,
      secure: SECURE_COOKIES,
      sameSite: 'strict',
      path: '/',
    });
  }
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasAccess = Boolean(req.cookies.get(COOKIES.access)?.value);
  const refreshToken = req.cookies.get(COOKIES.refresh)?.value;

  if (pathname === '/login' && (hasAccess || refreshToken)) {
    const res = NextResponse.redirect(new URL('/dashboard', req.url));
    ensureCsrf(req, res);
    return res;
  }

  if (!isPublic && !hasAccess) {
    const refreshed = refreshToken
      ? await refreshSession(refreshToken, upstreamHeaders(req))
      : null;
    if (!refreshed?.ok) {
      const url = new URL('/login', req.url);
      if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
      const res = NextResponse.redirect(url);
      if (refreshed) clearSessionCookies(res.cookies);
      ensureCsrf(req, res);
      return res;
    }
    const res = NextResponse.next();
    setSessionCookies(res.cookies, refreshed.tokens);
    ensureCsrf(req, res);
    return res;
  }

  const res =
    pathname === '/' ? NextResponse.redirect(new URL('/dashboard', req.url)) : NextResponse.next();
  ensureCsrf(req, res);
  return res;
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
