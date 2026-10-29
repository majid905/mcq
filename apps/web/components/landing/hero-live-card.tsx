'use client';

import { formatDecimal, formatInteger } from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * Next live exam for the hero. Until `GET /public/landing` exists the card shows the design's
 * sample (test ১৩, ৩২০ enrolled, counting down to the next 21:00 local time).
 */
export interface NextLiveExam {
  number: number;
  starts_at?: string;
  enrolled_count: number;
}

const SAMPLE: NextLiveExam = { number: 13, enrolled_count: 320 };

/** Next 21:00 in the visitor's local time, as in the prototype. */
function next9pm(now: number): number {
  const d = new Date(now);
  const target = new Date(d);
  target.setHours(21, 0, 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function useSecondsLeft(iso: string | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const target = iso ? new Date(iso).getTime() : next9pm(now);
      setLeft(Math.max(0, Math.floor((target - now) / 1000)));
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [iso]);
  return left;
}

export function HeroLiveCard({ exam = SAMPLE }: { exam?: NextLiveExam }) {
  const t = useTranslations('landing.live');
  const locale = useLocale();
  const left = useSecondsLeft(exam.starts_at);
  // Empty until mounted, so the server render never shows a stale time.
  const cells: [number | null, string][] = [
    [left === null ? null : Math.floor(left / 3600), t('hours')],
    [left === null ? null : Math.floor((left % 3600) / 60), t('minutes')],
    [left === null ? null : left % 60, t('seconds')],
  ];

  return (
    <div className="landing-in landing-shadow flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-[clamp(--spacing(4.5),2vw,--spacing(6))] [animation-delay:0.05s]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-pill bg-live-soft px-3 py-0.75 text-body-sm leading-[1.65] font-semibold text-live">
          <span aria-hidden className="relative size-2 flex-none">
            <span className="landing-ping landing-ping-fast absolute inset-0 rounded-pill bg-live" />
            <span className="absolute inset-0 rounded-pill bg-live" />
          </span>
          {t('badge')}
        </span>
        <span className="text-body-sm leading-[1.65] text-text-subtle">{t('enrolling')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <strong className="font-display text-[length:clamp(var(--mcq-font-size-h2),1.8vw,var(--mcq-font-size-card-title))] leading-[1.3] font-semibold text-text">
          {t('title', { n: formatInteger(exam.number, locale) })}
        </strong>
        <span className="text-meta leading-[1.65] text-text-muted">{t('meta')}</span>
      </div>
      <div
        role="timer"
        aria-label={t('timerLabel')}
        className="grid grid-cols-3 gap-2.5"
        data-testid="live-countdown"
      >
        {cells.map(([v, label]) => (
          <div
            key={label}
            className="flex flex-col items-center overflow-hidden rounded-[14px] border border-border bg-bg px-2 py-3 leading-[1.2]"
          >
            <strong className="font-display text-[length:clamp(var(--mcq-font-size-stat),2.6vw,var(--mcq-font-size-countdown))] leading-[1.2] font-semibold text-text tabular-nums">
              {v === null ? '––' : formatInteger(v, locale, 2)}
            </strong>
            <span className="text-body-sm leading-[1.2] text-text-subtle">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
        <span className="text-meta leading-[1.65] text-text-muted">
          {t('enrolled', { count: formatDecimal(exam.enrolled_count, locale) })}
        </span>
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-meta font-semibold text-on-primary hover:bg-primary-hover"
        >
          {t('remind')}
        </Link>
      </div>
    </div>
  );
}
