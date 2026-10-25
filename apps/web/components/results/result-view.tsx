'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  ErrorState,
  ProgressBar,
  RankBadge,
  ScoreRing,
  Skeleton,
  StatTile,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { Check, Minus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAttemptResult } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';
import { useDurationText } from '@/lib/time';

/** E1 Result (FR-RES-01..04). */
export function ResultView({ attemptId }: { attemptId: string }) {
  const t = useTranslations('result');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const duration = useDurationText();
  const result = useAttemptResult(attemptId);

  if (result.isPending || result.data === null) {
    return (
      <div
        aria-busy
        className="mx-auto flex max-w-reading flex-col items-center gap-4"
        data-testid="result-loading"
      >
        <Skeleton className="size-36 rounded-pill" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        {result.data === null && <p className="text-body-sm text-text-muted">{t('scoring')}</p>}
      </div>
    );
  }
  if (result.isError) {
    return (
      <AppCard>
        <ErrorState
          message={errorText(result.error)}
          retryLabel={tc('retry')}
          onRetry={() => void result.refetch()}
        />
      </AppCard>
    );
  }

  const r = result.data;
  const n = (v: number | null | undefined) => formatInteger(v ?? 0, locale);
  const d = (v: number | null | undefined) => formatDecimal(v ?? 0, locale);
  const rank = r.rank;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4" data-testid="result">
      <div className="text-center">
        <h1 className="text-h2 font-semibold text-text">{r.title}</h1>
        <div className="mt-2 flex justify-center gap-2">
          {rank && !rank.is_final && <AppChip variant="accent">{t('provisional')}</AppChip>}
          {r.passed === true && <AppChip variant="success">✓ {t('passed')}</AppChip>}
          {r.passed === false && <AppChip variant="danger">✕ {t('failed')}</AppChip>}
        </div>
      </div>

      <ScoreRing
        className="mx-auto"
        score={r.score ?? 0}
        total={r.total_marks ?? 0}
        format={(v) => formatDecimal(Math.round(v * 100) / 100, locale)}
        caption={t('outOf', { total: d(r.total_marks) })}
        label={t('scoreLabel', { score: d(r.score), total: d(r.total_marks) })}
      />
      <p className="text-center text-body-sm text-text-muted">
        {t('accuracyTime', { pct: d(r.accuracy_pct), time: duration(r.time_taken_sec ?? 0) })}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label={t('correct')}
          value={n(r.correct)}
          tone="success"
          icon={<Check aria-hidden size={18} />}
        />
        <StatTile
          label={t('wrong')}
          value={n(r.wrong)}
          tone="danger"
          icon={<X aria-hidden size={18} />}
        />
        <StatTile
          label={t('skipped')}
          value={n(r.skipped)}
          tone="muted"
          icon={<Minus aria-hidden size={18} />}
        />
        <StatTile label={t('negative')} value={`−${d(r.negative_marks)}`} tone="danger" />
      </div>

      {rank && (
        <RankBadge
          title={t('rank', { rank: n(rank.overall), participants: n(rank.participants) })}
          detail={[
            rank.district ? t('districtRank', { rank: n(rank.district) }) : null,
            t('ahead', { pct: d(Math.round(rank.percentile ?? 0)) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      )}

      {(r.sections ?? []).length > 0 && (
        <AppCard className="p-0">
          <h2 className="px-4 pt-4 text-h3 font-semibold text-text">{t('bySubject')}</h2>
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('subject')}
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  <span className="sr-only">{t('correctShare')}</span>
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('score')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(r.sections ?? []).map((s) => {
                const total = (s.correct ?? 0) + (s.wrong ?? 0) + (s.skipped ?? 0);
                return (
                  <tr key={s.node_id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 text-text">
                      {s.label}
                      <div className="text-caption text-text-muted">
                        ✓ {n(s.correct)} · ✕ {n(s.wrong)} · – {n(s.skipped)}
                      </div>
                    </td>
                    <td className="w-28 px-2">
                      <ProgressBar
                        value={s.correct ?? 0}
                        max={total || 1}
                        label={s.label ?? ''}
                        tone="success"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-text">
                      {d(s.score)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AppCard>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {r.solutions_available ? (
          <AppButton asChild fullWidth className="sm:flex-1">
            <Link href={`/results/${attemptId}/solutions`}>{t('solutions')}</Link>
          </AppButton>
        ) : (
          <p className="rounded-md bg-surface-muted px-4 py-3 text-body-sm text-text-muted sm:flex-1">
            {t('solutionsLater')}
          </p>
        )}
        {r.exam_id && rank && (
          <AppButton asChild variant="secondary" fullWidth className="sm:flex-1">
            <Link href={`/exams/${r.exam_id}/leaderboard`}>{t('leaderboard')}</Link>
          </AppButton>
        )}
      </div>
    </div>
  );
}
