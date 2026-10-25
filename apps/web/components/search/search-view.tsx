'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  AppTextField,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
  formatInteger,
} from '@mcq/ui';
import { History, Lock, Search, SlidersHorizontal, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useSearch } from '@/lib/practice/queries';
import { useCategories } from '@/lib/queries';
import { renderRichHtml } from '@/lib/rich-html';

const RECENT_KEY = 'mcq-recent-searches';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** G1 Search (FR-SRCH-01..03): debounced, recent searches, filters, highlighted results. */
export function SearchView() {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const categories = useCategories();
  const [text, setText] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const q = useDebounced(text, 300);
  const search = useSearch(q, category, year);

  useEffect(() => {
    const id = setTimeout(() => setRecent(readRecent()), 0);
    return () => clearTimeout(id);
  }, []);

  // Remember a query once it returned results.
  const firstHits = search.data?.pages[0]?.hits.length ?? 0;
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || firstHits === 0) return;
    const next = [term, ...readRecent().filter((r) => r !== term)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Private mode: recent searches are a convenience only.
    }
    const id = setTimeout(() => setRecent(next), 0);
    return () => clearTimeout(id);
  }, [q, firstHits]);

  const hits = search.data?.pages.flatMap((p) => p.hits) ?? [];
  const total = search.data?.pages[0]?.total ?? 0;
  const years = Array.from({ length: 12 }, (_, i) => 2025 - i);

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <div className="flex items-end gap-2">
        <AppTextField
          className="flex-1"
          label={t('label')}
          type="search"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          leading={<Search aria-hidden size={18} />}
          placeholder={t('placeholder')}
          trailing={
            text ? (
              <button
                type="button"
                aria-label={t('clear')}
                onClick={() => setText('')}
                className="grid size-10 place-items-center text-text-muted"
              >
                <X aria-hidden size={18} />
              </button>
            ) : undefined
          }
        />
        <button
          type="button"
          aria-expanded={showFilters}
          aria-controls="search-filters"
          aria-label={t('filters')}
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'grid size-13 flex-none place-items-center rounded-md border-[1.5px]',
            showFilters || category || year
              ? 'border-primary bg-primary-soft text-primary'
              : 'border-border-strong text-text-muted',
          )}
        >
          <SlidersHorizontal aria-hidden size={20} />
        </button>
      </div>

      {showFilters && (
        <AppCard id="search-filters" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">{t('category')}</span>
            <div className="flex flex-wrap gap-2">
              {[
                { id: null as string | null, label: t('any') },
                ...(categories.data ?? []).map((c) => ({
                  id: c.id ?? null,
                  label: (locale === 'bn' ? c.name_bn : c.name_en) ?? '',
                })),
              ].map((c) => (
                <button
                  key={c.id ?? 'any'}
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'h-9 rounded-pill border px-3 text-body-sm',
                    category === c.id
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border text-text-muted',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5 text-body-sm font-medium text-text">
            {t('year')}
            <select
              value={year ?? ''}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              className="h-11 rounded-md border-[1.5px] border-border-strong bg-surface px-3 text-body text-text"
            >
              <option value="">{t('any')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {formatInteger(y, locale)}
                </option>
              ))}
            </select>
          </label>
        </AppCard>
      )}

      {q.trim().length < 2 ? (
        recent.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              <History aria-hidden size={14} />
              {t('recent')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button key={r} type="button" onClick={() => setText(r)}>
                  <AppChip>{r}</AppChip>
                </button>
              ))}
            </div>
          </div>
        )
      ) : search.isPending ? (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : search.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(search.error)}
            retryLabel={tc('retry')}
            onRetry={() => void search.refetch()}
          />
        </AppCard>
      ) : hits.length === 0 ? (
        <AppCard>
          <EmptyState title={t('empty')} />
        </AppCard>
      ) : (
        <>
          <p className="text-body-sm text-text-muted" aria-live="polite">
            {t('count', { count: formatInteger(total, locale) })}
          </p>
          <ul className="flex flex-col gap-2" data-testid="search-results">
            {hits.map((h) => (
              <li key={h.question?.id}>
                <Link
                  href={`/questions/${h.question?.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <div
                    className="mcq-html text-body text-text [&_mark]:rounded-sm [&_mark]:bg-accent-soft [&_mark]:px-0.5 [&_mark]:text-text"
                    dangerouslySetInnerHTML={{
                      __html: renderRichHtml(h.highlight ?? h.question?.body),
                    }}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-muted">
                    {h.question?.source_label && (
                      <AppChip variant="primary">{h.question.source_label}</AppChip>
                    )}
                    {h.question?.topic && (
                      <span>
                        {locale === 'bn' ? h.question.topic.name_bn : h.question.topic.name_en}
                      </span>
                    )}
                    {h.question?.answer_locked && (
                      <span className="inline-flex items-center gap-1">
                        <Lock aria-hidden size={12} />
                        {t('locked')}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {search.hasNextPage && (
            <AppButton
              variant="secondary"
              className="self-center"
              loading={search.isFetchingNextPage}
              onClick={() => void search.fetchNextPage()}
            >
              {t('more')}
            </AppButton>
          )}
        </>
      )}
    </div>
  );
}
