/** Paths without the locale prefix. Shared by middleware (guards) and the app shell (nav). */

/** Need a session; middleware sends guests to /login?next=. */
export const PROTECTED_PREFIXES = [
  '/home',
  '/exams',
  '/practice',
  '/analytics',
  '/profile',
  '/settings',
  '/notifications',
  '/search',
  '/bookmarks',
  '/bank',
  '/onboarding',
  '/room',
  '/results',
  '/history',
] as const;

/** Only for guests; signed-in users go to /home. */
export const GUEST_ONLY_PREFIXES = ['/login', '/register', '/otp', '/forgot'] as const;

function matches(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export const isProtectedPath = (path: string) => matches(path, PROTECTED_PREFIXES);
export const isGuestOnlyPath = (path: string) => matches(path, GUEST_ONLY_PREFIXES);

/** Only same-site relative paths are allowed as ?next= targets (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}

/** Splits "/en/home" into { prefix: "/en", path: "/home" }; Bangla has no prefix. */
export function splitLocalePath(pathname: string): { prefix: '' | '/en'; path: string } {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    return { prefix: '/en', path: pathname.slice(3) || '/' };
  }
  return { prefix: '', path: pathname };
}
