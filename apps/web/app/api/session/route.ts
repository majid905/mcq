import { type NextRequest, NextResponse } from 'next/server';
import { COOKIES } from '@/lib/session-cookies';

/**
 * Lets public pages (/plans, landing) know whether to load user data, without a 401 that would
 * send a guest to /login. Only reports cookie presence; the API still decides on every call.
 * More specific than app/api/[...path], so it is not proxied.
 */
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const signedIn = Boolean(
    req.cookies.get(COOKIES.refresh)?.value || req.cookies.get(COOKIES.access)?.value,
  );
  return NextResponse.json(
    { data: { signed_in: signedIn } },
    { headers: { 'cache-control': 'no-store' } },
  );
}
