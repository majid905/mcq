'use client';

import {
  AppCard,
  Avatar,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  cn,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { type LeaderboardRow, useLeaderboard } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';
import { useDurationText } from '@/lib/time';

function Row({ row, mine }: { row: LeaderboardRow; mine?: boolean }) {
  const t = useTranslations('leaderboard');
  const locale = useLocale();
  const duration = useDurationText();
  return (
    <li
      aria-current={mine ? 'true' : undefined}
      className={cn('flex min-h-14 items-center gap-3 px-4 py-2', mine && 'bg-primary-soft')}
    >
      <span className="w-10 text-right text-body font-semibold tabular-nums text-text-muted">
        {formatInteger(row.rank ?? 0, locale)}
      </span>
      <Avatar name={row.name ?? ''} src={row.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text">
          {row.name}
          {mine && <span className="ml-1 text-caption text-primary">({t('you')})</span>}
        </p>
        {row.district && <p className="truncate text-caption text-text-muted">{row.district}</p>}
      </div>
      <div className="text-right">
        <p className="text-body font-semibold tabular-nums text-text">
          {formatDecimal(row.score ?? 0, locale)}
        </p>
        <p className="text-caption text-text-muted">{duration(row.time_taken_sec ?? 0)}</p>
      </div>
    </li>
  );
}

/** E3 Leaderboard (FR-RES-06): overall/district, podium, list, my row pinned. */
export function LeaderboardView({ examId }: { examId: string }) {
  const t = useTranslations('leaderboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const [scope, setScope] = useState<'overall' | 'district'>('overall');
  const board = useLeaderboard(examId, scope);

  const top = board.data?.top ?? [];
  const me = board.data?.me;
  const podium = top.slice(0, 3);
  const meInTop = me && top.some((r) => r.user_id === me.user_id);

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
        <SegmentedControl
          label={t('scope')}
          value={scope}
          onValueChange={setScope}
          options={[
            { value: 'overall', label: t('overall') },
            { value: 'district', label: t('district') },
          ]}
        />
      </div>
      {board.data && (
        <p className="text-body-sm text-text-muted">
          {t('participants', { count: formatInteger(board.data.participants ?? 0, locale) })}
          {!board.data.is_final && ` · ${t('provisional')}`}
        </p>
      )}

      {board.isPending ? (
        <div aria-busy className="flex flex-col gap-3">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : board.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(board.error)}
            retryLabel={tc('retry')}
            onRetry={() => void board.refetch()}
          />
        </AppCard>
      ) : top.length === 0 ? (
        <AppCard>
          <EmptyState title={t('empty')} />
        </AppCard>
      ) : (
        <>
          <ol aria-label={t('podium')} className="grid grid-cols-3 items-end gap-2">
            {[podium[1], podium[0], podium[2]].map((row, i) =>
              row ? (
                <li
                  key={row.user_id}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border border-border bg-surface px-2 pt-3 text-center',
                    i === 1 ? 'border-accent bg-accent-soft pb-6' : 'pb-3',
                  )}
                >
                  <Avatar name={row.name ?? ''} src={row.avatar_url} size="md" />
                  <span className="text-caption font-semibold text-accent-text">
                    #{formatInteger(row.rank ?? 0, locale)}
                  </span>
                  <span className="line-clamp-1 text-body-sm font-medium text-text">
                    {row.name}
                  </span>
                  <span className="text-body-sm font-semibold tabular-nums text-text">
                    {formatDecimal(row.score ?? 0, locale)}
                  </span>
                </li>
              ) : (
                <li key={`empty-${i}`} />
              ),
            )}
          </ol>
          <AppCard className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {top.map((row) => (
                <Row key={row.user_id} row={row} mine={row.user_id === me?.user_id} />
              ))}
            </ul>
          </AppCard>
        </>
      )}

      {me && !meInTop && (
        <div className="fixed inset-x-0 bottom-17 z-(--mcq-z-sticky) border-t border-border bg-surface md:bottom-0 lg:left-62">
          <ul className="mx-auto max-w-reading">
            <Row row={me} mine />
          </ul>
        </div>
      )}
    </div>
  );
}
