/**
 * Admin cookie names (docs/04-API.md section 2: adm_at / adm_rt). Tokens are httpOnly; only the
 * CSRF token is readable by JavaScript (double-submit).
 */
export const COOKIES = {
  access: 'adm_at',
  refresh: 'adm_rt',
  csrf: 'adm_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf';

/** Admin sessions are shorter than student ones: re-login after 7 days. */
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;
