'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

/**
 * Text for an error: our own copy for codes we know (errors.<CODE>), else the API's message
 * (already localized via Accept-Language), else a generic line.
 */
export function useErrorText(): (error: unknown) => string {
  const t = useTranslations('errors');
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.code === 'NETWORK') return t('NETWORK');
        if (t.has(error.code as Parameters<typeof t.has>[0])) {
          return t(error.code as Parameters<typeof t>[0]);
        }
        if (error.message) return error.message;
      }
      return t('generic');
    },
    [t],
  );
}

/** Seconds left until `until` (epoch ms), ticking every second; 0 when passed or unset. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    };
    // First tick right away so a new deadline does not show a stale `now`.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

/** When a lock (ACCOUNT_LOCKED details.until) or rate limit (Retry-After) ends, as epoch ms. */
export function blockedUntil(error: unknown): number | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'ACCOUNT_LOCKED' && typeof error.details.until === 'string') {
    const at = Date.parse(error.details.until);
    return Number.isFinite(at) ? at : null;
  }
  if (error.status === 429 && error.retryAfterSec) return Date.now() + error.retryAfterSec * 1000;
  return null;
}
