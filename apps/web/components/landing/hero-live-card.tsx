'use client';

import { AppButton, formatDecimal, formatInteger } from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';

/**
 * Next live exam for the hero. No public endpoint exists yet (contract-change request
 * "GET /public/landing"), so the page passes null and the card shows no times or counts.
 */
export interface NextLiveExam {
  title: string;
  starts_at: string;
  question_count: number;
  duration_min: number;
  enrolled_count: number;
}

function useSecondsUntil(iso: string | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const target = new Date(iso).getTime();
    const tick = () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [iso]);
  return left;
}

export function HeroLiveCard({ exam }: { exam: NextLiveExam | null }) {
  const t = useTranslations('landing.live');
  const locale = useLocale();
  const left = useSecondsUntil(exam?.starts_at);
  // Empty until mounted, so the server render never shows a stale time.
  const cells: [number | null, string][] = [
    [left === null ? null : Math.floor(left / 3600), t('hours')],
    [left === null ? null : Math.floor((left % 3600) / 60), t('minutes')],
    [left === null ? null : left % 60, t('seconds')],
  ];

  return (
    <div className="landing-in flex flex-col gap-4 rounded-xl border border-border bg-surface p-4.5 shadow-lg md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-pill bg-live-soft px-3 py-0.5 text-body-sm font-semibold text-live">
          <span aria-hidden className="relative size-2 flex-none">
            <span className="landing-ping absolute inset-0 rounded-pill bg-live" />
            <span className="absolute inset-0 rounded-pill bg-live" />
          </span>
          {t('badge')}
        </span>
        <span className="text-body-sm text-text-subtle">{exam ? t('enrolling') : t('weekly')}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <strong className="font-display text-h2 font-semibold text-text">
          {exam?.title ?? t('title')}
        </strong>
        <span className="text-body text-text-muted">{t('meta')}</span>
      </div>
      {exam ? (
        <div
          role="timer"
          aria-label={t('timerLabel')}
          className="grid grid-cols-3 gap-2.5"
          data-testid="live-countdown"
        >
          {cells.map(([v, label]) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-lg border border-border bg-bg px-2 py-3 leading-tight"
            >
              <strong className="font-display text-stat font-semibold tabular-nums text-text">
                {v === null ? '––' : formatInteger(v, locale, 2)}
              </strong>
              <span className="text-body-sm text-text-subtle">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-bg px-4 py-3 text-body-sm text-text-muted">
          {t('scheduleHint')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
        {exam ? (
          <span className="text-body text-text-muted">
            {t('enrolled', { count: formatDecimal(exam.enrolled_count, locale) })}
          </span>
        ) : (
          <span />
        )}
        <AppButton asChild size="sm" className="h-11 px-5">
          <Link href="/register">{t('remind')}</Link>
        </AppButton>
      </div>
    </div>
  );
}
