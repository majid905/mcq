'use client';

import { formatInteger } from '@mcq/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** Current time, re-rendered every `intervalMs`, corrected by the server clock offset. */
export function useServerNow(serverTime: string | undefined, intervalMs = 30_000): number {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!serverTime) return;
    const parsed = Date.parse(serverTime);
    // Timers use the server clock (docs/02): the device clock may be off by minutes.
    const id = setTimeout(() => setOffset(Number.isFinite(parsed) ? parsed - Date.now() : 0), 0);
    return () => clearTimeout(id);
  }, [serverTime]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now + offset;
}

/** "২ ঘণ্টা ১৪ মিনিট" / "2 h 14 min" for a positive number of seconds. */
export function useDurationText(): (seconds: number) => string {
  const t = useTranslations('time');
  const locale = useLocale();
  return (seconds) => {
    const total = Math.max(0, Math.round(seconds / 60));
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    const m = total % 60;
    const n = (v: number) => formatInteger(v, locale);
    if (d > 0) return t('daysHours', { d: n(d), h: n(h) });
    if (h > 0) return t('hoursMinutes', { h: n(h), m: n(m) });
    return t('minutes', { m: n(Math.max(1, m)) });
  };
}

/** Exam start as "আজ রাত ৯:০০" style text: weekday/date plus time, Asia/Dhaka. */
export function useStartText(): (iso: string) => string {
  const format = useFormatter();
  return (iso) =>
    format.dateTime(new Date(iso), {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
}

/** Greeting key by the hour in Dhaka. */
export function greetingKey(now: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Dhaka',
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}
