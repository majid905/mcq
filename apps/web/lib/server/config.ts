/**
 * Where the BFF sends requests. API_BASE_URL is server-only (e.g. an internal address in
 * production); NEXT_PUBLIC_API_BASE is the shared default; the Prism mock is the fallback.
 */
export const UPSTREAM_BASE = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://localhost:4010/v1'
).replace(/\/+$/, '');

export const SECURE_COOKIES = process.env.NODE_ENV === 'production';
