'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { Bookmark, ChevronRight, RotateCcw, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { FormError } from '@/components/auth/fields';
import { CategoryIcon } from '@/components/category-icon';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useTaxonomyChildren, useTopicStats } from '@/lib/practice/queries';
import { useMe } from '@/lib/queries';
import { AccuracyRing } from './accuracy-ring';
import { useStartPractice } from './use-start-practice';

/** F1 Practice hub (FR-PRAC-01): category tabs (goals first), subjects, weak topics, shortcuts. */
export function PracticeHub() {
  const t = useTranslations('practice');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useMe();
  const categories = useTaxonomyChildren(null);
  const practice = useStartPractice();

  const ordered = useMemo(() => {
    const goals = new Set(me.data?.target_node_ids ?? []);
    return [...(categories.data ?? [])].sort(
      (a, b) => Number(goals.has(b.id ?? '')) - Number(goals.has(a.id ?? '')),
    );
  }, [categories.data, me.data]);
  const active = params.get('category') ?? ordered[0]?.id ?? null;
  const subjects = useTaxonomyChildren(active, Boolean(active));
  const topics = useTopicStats(null);
  const weak = (topics.data ?? []).filter((s) => s.is_weak).slice(0, 4);
  const name = (n: { name_bn?: string; name_en?: string }) =>
    (locale === 'bn' ? n.name_bn : n.name_en) ?? '';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
        <div className="flex flex-wrap gap-2">
          <AppButton asChild size="sm">
            <Link href="/practice/custom">
              <SlidersHorizontal aria-hidden size={16} />
              {t('custom')}
            </Link>
          </AppButton>
          <AppButton asChild size="sm" variant="secondary">
            <Link href="/wrong">
              <RotateCcw aria-hidden size={16} />
              {t('wrong')}
            </Link>
          </AppButton>
          <AppButton asChild size="sm" variant="secondary">
            <Link href="/bookmarks">
              <Bookmark aria-hidden size={16} />
              {t('bookmarks')}
            </Link>
          </AppButton>
        </div>
      </div>

      {categories.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(categories.error)}
            retryLabel={tc('retry')}
            onRetry={() => void categories.refetch()}
          />
        </AppCard>
      ) : (
        <div
          role="tablist"
          aria-label={t('categories')}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {categories.isPending
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-24 rounded-pill" />)
            : ordered.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  type="button"
                  aria-selected={c.id === active}
                  onClick={() =>
                    router.replace({ pathname, query: { category: c.id ?? '' } }, { scroll: false })
                  }
                  className={cn(
                    'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-pill border px-4 text-body-sm font-medium',
                    c.id === active
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border bg-surface text-text-muted hover:text-text',
                  )}
                >
                  <CategoryIcon icon={c.icon} size={16} />
                  {name(c)}
                </button>
              ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-label={t('subjects')} className="flex flex-col gap-3 lg:col-span-2">
          {subjects.isPending && active ? (
            <div aria-busy className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : subjects.isError ? (
            <AppCard>
              <ErrorState
                message={errorText(subjects.error)}
                retryLabel={tc('retry')}
                onRetry={() => void subjects.refetch()}
              />
            </AppCard>
          ) : (subjects.data ?? []).length === 0 ? (
            <AppCard>
              <EmptyState title={t('noSubjects')} />
            </AppCard>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {(subjects.data ?? []).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/practice/node/${s.id}`}
                    data-testid="subject-card"
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <AccuracyRing pct={s.progress?.accuracy_pct ?? null} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-semibold text-text">{name(s)}</p>
                      <p className="text-caption text-text-muted">
                        {t('questions', { count: formatDecimal(s.question_count ?? 0, locale, 0) })}
                        {s.progress?.attempted
                          ? ` · ${t('attempted', { count: formatInteger(s.progress.attempted, locale) })}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight aria-hidden size={18} className="text-text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="weak-title" className="flex flex-col gap-3">
          <AppCard>
            <h2 id="weak-title" className="flex items-center gap-2 text-h3 font-semibold text-text">
              <TriangleAlert aria-hidden size={18} className="text-warning" />
              {t('weakTopics')}
            </h2>
            {topics.isPending ? (
              <Skeleton className="mt-3 h-24 rounded-md" />
            ) : weak.length === 0 ? (
              <p className="mt-2 text-body-sm text-text-muted">{t('noWeak')}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {weak.map((w) => (
                  <li key={w.node?.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium text-text">
                        {w.node ? name(w.node) : ''}
                      </p>
                      <AppChip variant="danger">
                        {t('accuracy', { pct: formatDecimal(w.accuracy_pct ?? 0, locale, 0) })}
                      </AppChip>
                    </div>
                    <AppButton
                      size="sm"
                      variant="secondary"
                      loading={practice.isPending}
                      onClick={() =>
                        practice.start(
                          { mode: 'quick', node_ids: [w.node?.id ?? ''], question_count: 20 },
                          w.node ? name(w.node) : '',
                        )
                      }
                    >
                      {t('practiceNow')}
                    </AppButton>
                  </li>
                ))}
              </ul>
            )}
            <FormError message={practice.error ? errorText(practice.error) : null} />
          </AppCard>
        </section>
      </div>
    </div>
  );
}
