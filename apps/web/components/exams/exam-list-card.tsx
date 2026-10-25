'use client';

import { AppCard, AppChip, formatDecimal, formatInteger } from '@mcq/ui';
import { ChevronRight, Crown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { ExamCard } from '@/lib/queries';
import { useDurationText, useStartText } from '@/lib/time';

/** docs/05 ExamCard for lists: status, title, timing, meta, my score; whole card links to D2. */
export function ExamListCard({ exam, now }: { exam: ExamCard; now: number }) {
  const t = useTranslations('exams');
  const th = useTranslations('home');
  const locale = useLocale();
  const duration = useDurationText();
  const startText = useStartText();
  const n = (v: number | undefined | null) => formatInteger(v ?? 0, locale);
  const running = exam.status === 'running';
  const finished = exam.status === 'finished' || exam.status === 'merit_published';
  const startsIn = exam.start_at ? (Date.parse(exam.start_at) - now) / 1000 : 0;
  const left = exam.end_at ? (Date.parse(exam.end_at) - now) / 1000 : 0;
  const myScore = exam.my_attempt?.score;

  return (
    <Link
      href={`/exams/${exam.id}`}
      data-testid="exam-card"
      className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <AppCard live={running} interactive className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {running && <AppChip variant="live">{th('liveNow')}</AppChip>}
            {exam.category && <AppChip>{exam.category}</AppChip>}
            {exam.is_premium && (
              <AppChip variant="accent" icon={<Crown aria-hidden size={14} />}>
                {th('premium')}
              </AppChip>
            )}
          </div>
          <h3 className="mt-2 text-h3 font-semibold text-text">{exam.title}</h3>
          <p className="mt-1 text-body-sm text-text-muted">
            {running && left > 0
              ? th('timeLeft', { time: duration(left) })
              : !finished && exam.start_at
                ? startsIn > 0 && startsIn < 86_400
                  ? th('startsIn', { time: duration(startsIn) })
                  : startText(exam.start_at)
                : null}
            {(running || (!finished && exam.start_at)) && ' · '}
            {th('examMeta', {
              questions: n(exam.question_count),
              marks: n(exam.total_marks),
              minutes: n(Math.round((exam.duration_sec ?? 0) / 60)),
            })}
          </p>
          {finished && (
            <p className="mt-1 text-body-sm font-medium text-primary">
              {myScore !== null && myScore !== undefined
                ? t('myScore', {
                    score: formatDecimal(myScore, locale),
                    total: n(exam.total_marks),
                  })
                : t('takeAsPractice')}
            </p>
          )}
        </div>
        <ChevronRight aria-hidden size={20} className="flex-none text-text-subtle" />
      </AppCard>
    </Link>
  );
}
