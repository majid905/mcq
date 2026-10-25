'use client';

import { AppButton, AppCard, EmptyState, ErrorState, Skeleton, cn } from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type ExamListStatus, useExamList } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';
import { useCategories, useMe } from '@/lib/queries';
import { useServerNow } from '@/lib/time';
import { ExamListCard } from './exam-list-card';

const TABS: ExamListStatus[] = ['upcoming', 'running', 'finished'];

/** D1 Exam list (FR-EXAM-01, 11): status tabs, category chips (goals first), infinite list. */
export function ExamList() {
  const t = useTranslations('exams');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS as string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as ExamListStatus)
    : 'running';
  const category = params.get('category');
  const list = useExamList(tab, category);
  const categories = useCategories();
  const me = useMe();
  const now = useServerNow(undefined, 30_000);

  const chips = useMemo(() => {
    const goals = new Set(me.data?.target_node_ids ?? []);
    return [...(categories.data ?? [])].sort(
      (a, b) => Number(goals.has(b.id ?? '')) - Number(goals.has(a.id ?? '')),
    );
  }, [categories.data, me.data]);

  const setQuery = (next: { tab?: ExamListStatus; category?: string | null }) => {
    const query: Record<string, string> = { tab: next.tab ?? tab };
    const c = next.category === undefined ? category : next.category;
    if (c) query.category = c;
    router.replace({ pathname, query }, { scroll: false });
  };

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <div role="tablist" aria-label={t('title')} className="flex gap-1 border-b border-border">
        {TABS.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={s === tab}
            onClick={() => setQuery({ tab: s })}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-body font-medium',
              s === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {t(`tabs.${s}`)}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={t('categories')}>
        {[
          { id: null, label: t('allCategories') },
          ...chips.map((c) => ({
            id: c.id ?? null,
            label: (locale === 'bn' ? c.name_bn : c.name_en) ?? '',
          })),
        ].map((c) => (
          <button
            key={c.id ?? 'all'}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setQuery({ category: c.id })}
            className={cn(
              'h-9 whitespace-nowrap rounded-pill border px-4 text-body-sm font-medium',
              category === c.id
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-surface text-text-muted hover:text-text',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-3">
        {list.isPending ? (
          <div aria-busy className="flex flex-col gap-3" data-testid="exams-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : list.isError ? (
          <AppCard>
            <ErrorState
              message={errorText(list.error)}
              retryLabel={tc('retry')}
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          </AppCard>
        ) : items.length === 0 ? (
          <AppCard>
            <EmptyState title={t(`empty.${tab}`)} description={t('emptyBody')} />
          </AppCard>
        ) : (
          <>
            {items.map((exam) => (
              <ExamListCard key={exam.id} exam={exam} now={now} />
            ))}
            {list.hasNextPage && (
              <AppButton
                variant="secondary"
                className="self-center"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t('loadMore')}
              </AppButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}
