'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  ErrorState,
  PremiumLock,
  Skeleton,
  StatTile,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Trophy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApi } from '@/components/providers';
import { Link } from '@/i18n/navigation';
import { expectOk } from '@/lib/api';
import { type ExamDetail, examKeys, useExamDetail } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';
import { useDurationText, useServerNow, useStartText } from '@/lib/time';

function useReminder(exam: ExamDetail) {
  const api = useApi();
  const qc = useQueryClient();
  const key = examKeys.detail(exam.id ?? '');
  return useMutation({
    mutationFn: (on: boolean) => {
      const params = { params: { path: { id: exam.id ?? '' } } };
      return expectOk(
        on ? api.PUT('/exams/{id}/reminder', params) : api.DELETE('/exams/{id}/reminder', params),
      );
    },
    onMutate: (on) => {
      const prev = qc.getQueryData<ExamDetail>(key);
      if (prev) qc.setQueryData<ExamDetail>(key, { ...prev, has_reminder: on });
      return { prev };
    },
    onError: (_e, _on, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
  });
}

/** Sticky bottom CTA by state (docs/06 D2). */
function Cta({ exam }: { exam: ExamDetail }) {
  const t = useTranslations('exams');
  const reminder = useReminder(exam);
  const attempt = exam.my_attempt;
  const finished = exam.status === 'finished' || exam.status === 'merit_published';
  const open = exam.status === 'running' || exam.type !== 'live';

  let cta: ReactNode;
  if (attempt && attempt.status !== 'in_progress') {
    cta = (
      <AppButton asChild fullWidth>
        <Link href={`/results/${attempt.attempt_id}`}>{t('viewResult')}</Link>
      </AppButton>
    );
  } else if (attempt?.status === 'in_progress') {
    cta = (
      <AppButton asChild fullWidth>
        <Link href={{ pathname: `/room/${attempt.attempt_id}`, query: { exam: exam.id } }}>
          {t('resume')}
        </Link>
      </AppButton>
    );
  } else if (finished) {
    cta = (
      <AppButton asChild fullWidth variant="secondary">
        <Link href={{ pathname: `/exams/${exam.id}/instructions`, query: { mode: 'practice' } }}>
          {t('takeAsPractice')}
        </Link>
      </AppButton>
    );
  } else if (open) {
    cta = (
      <AppButton asChild fullWidth>
        <Link href={`/exams/${exam.id}/instructions`}>{t('start')}</Link>
      </AppButton>
    );
  } else {
    cta = (
      <AppButton
        fullWidth
        variant={exam.has_reminder ? 'secondary' : 'primary'}
        aria-pressed={exam.has_reminder}
        loading={reminder.isPending}
        onClick={() => reminder.mutate(!exam.has_reminder)}
      >
        {exam.has_reminder ? <BellRing aria-hidden size={18} /> : <Bell aria-hidden size={18} />}
        {exam.has_reminder ? t('reminderOn') : t('setReminder')}
      </AppButton>
    );
  }
  return (
    <div className="sticky bottom-17 z-(--mcq-z-sticky) -mx-4 border-t border-border bg-surface px-4 py-3 md:bottom-0 md:mx-0 md:rounded-lg md:border">
      {cta}
    </div>
  );
}

/** D2 Exam detail (FR-EXAM-02, 03). */
export function ExamDetailView({ id }: { id: string }) {
  const t = useTranslations('exams');
  const th = useTranslations('home');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const detail = useExamDetail(id);
  const now = useServerNow(undefined, 30_000);
  const duration = useDurationText();
  const startText = useStartText();

  if (detail.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <AppCard>
        <ErrorState
          message={errorText(detail.error)}
          retryLabel={tc('retry')}
          onRetry={() => void detail.refetch()}
        />
      </AppCard>
    );
  }

  const exam = detail.data;
  const n = (v: number | null | undefined) => formatInteger(v ?? 0, locale);
  const d = (v: number | null | undefined) => formatDecimal(v ?? 0, locale);
  const running = exam.status === 'running';
  const finished = exam.status === 'finished' || exam.status === 'merit_published';
  const startsIn = exam.start_at ? (Date.parse(exam.start_at) - now) / 1000 : 0;
  const locked = exam.locked_reason;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <AppCard live={running}>
        <div className="flex flex-wrap items-center gap-2">
          {running && <AppChip variant="live">{th('liveNow')}</AppChip>}
          {exam.category && <AppChip>{exam.category}</AppChip>}
          {finished && <AppChip variant="success">{t('finished')}</AppChip>}
        </div>
        <h1 className="mt-2 text-h1 font-bold text-text">{exam.title}</h1>
        {exam.start_at && !finished && (
          <p className="mt-1 text-body-sm text-text-muted">
            {running && exam.end_at
              ? th('timeLeft', { time: duration((Date.parse(exam.end_at) - now) / 1000) })
              : startsIn > 0 && startsIn < 86_400
                ? th('startsIn', { time: duration(startsIn) })
                : startText(exam.start_at)}
          </p>
        )}
        {exam.description && <p className="mt-3 text-body text-text">{exam.description}</p>}
      </AppCard>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label={t('stat.time')}
          value={t('minutes', { m: n(Math.round((exam.duration_sec ?? 0) / 60)) })}
        />
        <StatTile label={t('stat.questions')} value={n(exam.question_count)} />
        <StatTile label={t('stat.marks')} value={d(exam.total_marks)} />
        <StatTile label={t('stat.negative')} value={`−${d(exam.negative_mark)}`} tone="danger" />
      </div>

      {locked && (
        <PremiumLock
          title={locked === 'premium_required' ? t('lockedPremium') : t('lockedQuota')}
          cta={
            <AppButton asChild size="sm">
              <Link href="/plans">{t('seePlans')}</Link>
            </AppButton>
          }
        />
      )}

      {(exam.syllabus ?? []).length > 0 && (
        <AppCard className="p-0">
          <h2 className="px-4 pt-4 text-h3 font-semibold text-text">{t('syllabus')}</h2>
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('subject')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('stat.questions')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('stat.marks')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(exam.syllabus ?? []).map((row) => (
                <tr key={row.node_id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 text-text">{row.label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">
                    {n(row.questions)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text">{d(row.marks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AppCard>
      )}

      {(exam.rules ?? []).length > 0 && (
        <AppCard>
          <h2 className="text-h3 font-semibold text-text">{t('rules')}</h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-body-sm text-text">
            {(exam.rules ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </AppCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-muted">
          {t('participants', { count: n(exam.participant_count) })}
        </p>
        {finished && (
          <AppButton asChild variant="ghost" size="sm">
            <Link href={`/exams/${exam.id}/leaderboard`}>
              <Trophy aria-hidden size={18} />
              {t('leaderboard')}
            </Link>
          </AppButton>
        )}
      </div>

      {!locked && <Cta exam={exam} />}
    </div>
  );
}
