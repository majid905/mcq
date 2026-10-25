'use client';

import {
  AppButton,
  AppCard,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  formatDecimal,
} from '@mcq/ui';
import { ChevronRight } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { type AttemptKind, type AttemptSummary, useHistory } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';

type Filter = 'all' | 'live' | 'practice';
const KIND: Record<Filter, AttemptKind | null> = {
  all: null,
  live: 'live',
  practice: 'quick_practice',
};

/** E4 My attempts: grouped by month, filter by kind. */
export function HistoryView() {
  const t = useTranslations('history');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const [filter, setFilter] = useState<Filter>('all');
  const history = useHistory(KIND[filter]);

  const groups = useMemo(() => {
    const items = history.data?.pages.flatMap((p) => p.items) ?? [];
    const map = new Map<string, AttemptSummary[]>();
    for (const a of items) {
      const key = (a.started_at ?? '').slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map];
  }, [history.data]);

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <SegmentedControl
        label={t('filter')}
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: 'all', label: t('all') },
          { value: 'live', label: t('live') },
          { value: 'practice', label: t('practice') },
        ]}
        className="self-start"
      />
      {history.isPending ? (
        <Skeleton aria-busy className="h-64 rounded-lg" />
      ) : history.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(history.error)}
            retryLabel={tc('retry')}
            onRetry={() => void history.refetch()}
          />
        </AppCard>
      ) : groups.length === 0 ? (
        <AppCard>
          <EmptyState
            title={t('empty')}
            action={
              <AppButton asChild size="sm">
                <Link href="/exams">{t('browse')}</Link>
              </AppButton>
            }
          />
        </AppCard>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              {month
                ? format.dateTime(new Date(`${month}-01T00:00:00Z`), {
                    month: 'long',
                    year: 'numeric',
                  })
                : ''}
            </h2>
            <AppCard className="p-0">
              <ul className="divide-y divide-border">
                {items.map((a) => (
                  <li key={a.attempt_id}>
                    <Link
                      href={`/results/${a.attempt_id}`}
                      className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-text">{a.title}</p>
                        <p className="text-caption text-text-muted">
                          {a.started_at &&
                            format.dateTime(new Date(a.started_at), {
                              day: 'numeric',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                        </p>
                      </div>
                      {a.score !== null && a.score !== undefined && (
                        <span className="text-body font-semibold tabular-nums text-text">
                          {formatDecimal(a.score, locale)}
                          {a.total_marks ? (
                            <span className="text-caption text-text-muted">
                              /{formatDecimal(a.total_marks, locale)}
                            </span>
                          ) : null}
                        </span>
                      )}
                      <ChevronRight aria-hidden size={18} className="text-text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            </AppCard>
          </section>
        ))
      )}
      {history.hasNextPage && (
        <AppButton
          variant="secondary"
          className="self-center"
          loading={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {t('loadMore')}
        </AppButton>
      )}
    </div>
  );
}
