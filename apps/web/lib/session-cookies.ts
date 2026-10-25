/**
 * Cookie names shared by middleware, the BFF and the browser (docs/04-API.md section 2).
 * Tokens are httpOnly; only the CSRF token is readable by JavaScript (double-submit).
 */
export const COOKIES = {
  access: 'at',
  refresh: 'rt',
  device: 'did',
  csrf: 'csrf',
  /** Short-lived OTP verification token between /otp and /register/profile or /forgot/new. */
  verification: 'vt',
} as const;

export const CSRF_HEADER = 'x-csrf';

/** Refresh token lifetime (30 days, docs/10 section 6). */
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;
/** OTP verification tokens are only useful for a few minutes. */
export const VERIFICATION_MAX_AGE = 60 * 10;
