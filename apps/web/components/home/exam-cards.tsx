'use client';

import { AppButton, AppCard, AppChip, formatInteger } from '@mcq/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/components/providers';
import { Link } from '@/i18n/navigation';
import { expectOk } from '@/lib/api';
import { type ExamCard, type HomeFeed, queryKeys } from '@/lib/queries';
import { useDurationText, useStartText } from '@/lib/time';

function useMeta(exam: ExamCard) {
  const t = useTranslations('home');
  const locale = useLocale();
  const n = (v: number | undefined) => formatInteger(v ?? 0, locale);
  return t('examMeta', {
    questions: n(exam.question_count),
    marks: n(exam.total_marks),
    minutes: n(Math.round((exam.duration_sec ?? 0) / 60)),
  });
}

/** C1.2 Running exam: live edge, "এখন চলছে", time left, "অংশ নিন". */
export function RunningExamCard({ exam, now }: { exam: ExamCard; now: number }) {
  const t = useTranslations('home');
  const locale = useLocale();
  const duration = useDurationText();
  const meta = useMeta(exam);
  const left = exam.end_at ? (Date.parse(exam.end_at) - now) / 1000 : 0;
  return (
    <AppCard live data-testid="running-exam">
      <div className="flex items-center justify-between gap-2">
        <AppChip variant="live">{t('liveNow')}</AppChip>
        {left > 0 && (
          <span className="text-caption text-text-muted">
            {t('timeLeft', { time: duration(left) })}
          </span>
        )}
      </div>
      <h3 className="mt-2 text-h3 font-semibold text-text">{exam.title}</h3>
      <p className="mt-1 text-body-sm text-text-muted">
        {meta}
        {exam.participant_count
          ? ` · ${t('participants', { count: formatInteger(exam.participant_count, locale) })}`
          : ''}
      </p>
      <AppButton asChild fullWidth className="mt-3">
        <Link href={`/exams/${exam.id}`}>{t('join')}</Link>
      </AppButton>
    </AppCard>
  );
}

/** C1.3 Next live exam: countdown, meta, reminder toggle + details. */
export function NextExamCard({ exam, now }: { exam: ExamCard; now: number }) {
  const t = useTranslations('home');
  const api = useApi();
  const qc = useQueryClient();
  const duration = useDurationText();
  const startText = useStartText();
  const meta = useMeta(exam);
  const startsIn = exam.start_at ? (Date.parse(exam.start_at) - now) / 1000 : 0;

  const reminder = useMutation({
    mutationFn: (on: boolean) => {
      const params = { params: { path: { id: exam.id ?? '' } } };
      return expectOk(
        on ? api.PUT('/exams/{id}/reminder', params) : api.DELETE('/exams/{id}/reminder', params),
      );
    },
    onMutate: (on) => {
      const prev = qc.getQueryData<HomeFeed>(queryKeys.home);
      if (prev?.next_exam) {
        qc.setQueryData<HomeFeed>(queryKeys.home, {
          ...prev,
          next_exam: { ...prev.next_exam, has_reminder: on },
        });
      }
      return { prev };
    },
    onError: (_e, _on, ctx) => ctx?.prev && qc.setQueryData(queryKeys.home, ctx.prev),
  });

  return (
    <AppCard data-testid="next-exam">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">{t('nextLive')}</span>
        {exam.category && <AppChip>{exam.category}</AppChip>}
      </div>
      <h3 className="mt-1.5 text-h3 font-semibold text-text">{exam.title}</h3>
      <p className="mt-1 text-body-sm text-text-muted">
        {exam.start_at &&
          (startsIn > 0 && startsIn < 86_400
            ? t('startsIn', { time: duration(startsIn) })
            : startText(exam.start_at))}
        {' · '}
        {meta}
      </p>
      <div className="mt-3 flex gap-2">
        <AppButton
          variant="secondary"
          size="sm"
          fullWidth
          aria-pressed={exam.has_reminder}
          onClick={() => reminder.mutate(!exam.has_reminder)}
        >
          {exam.has_reminder ? <BellRing aria-hidden size={18} /> : <Bell aria-hidden size={18} />}
          {exam.has_reminder ? t('reminderOn') : t('reminder')}
        </AppButton>
        <AppButton asChild variant="secondary" size="sm" fullWidth>
          <Link href={`/exams/${exam.id}`}>{t('details')}</Link>
        </AppButton>
      </div>
    </AppCard>
  );
}
