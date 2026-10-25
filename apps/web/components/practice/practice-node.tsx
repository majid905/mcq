'use client';

import { AppButton, AppCard, EmptyState, ErrorState, Skeleton, formatDecimal } from '@mcq/ui';
import type { components } from '@mcq/api-client-ts';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Timer, Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormError } from '@/components/auth/fields';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useTaxonomyChildren } from '@/lib/practice/queries';
import { AccuracyRing } from './accuracy-ring';
import { useStartPractice } from './use-start-practice';

type Node = components['schemas']['TaxonomyNode'];

/**
 * The API has no "get node" endpoint, so the breadcrumb is built from taxonomy lists already in
 * the query cache (the hub and earlier drill-downs).
 */
function useTrail(id: string): Node[] {
  const qc = useQueryClient();
  const all = qc
    .getQueriesData<Node[]>({ queryKey: ['taxonomy'] })
    .flatMap(([, nodes]) => nodes ?? []);
  const byId = new Map(all.map((n) => [n.id, n]));
  const trail: Node[] = [];
  let cur = byId.get(id);
  while (cur && trail.length < 6) {
    trail.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return trail;
}

/** F2 Subject / chapter drill-down (FR-PRAC-01). */
export function PracticeNode({ id }: { id: string }) {
  const t = useTranslations('practice');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const children = useTaxonomyChildren(id);
  const trail = useTrail(id);
  const practice = useStartPractice();
  const name = (n: Node) => (locale === 'bn' ? n.name_bn : n.name_en) ?? '';
  const current = trail[trail.length - 1];
  const title = current ? name(current) : t('title');

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <nav
        aria-label={t('breadcrumb')}
        className="flex flex-wrap items-center gap-1 text-body-sm text-text-muted"
      >
        <Link href="/practice" className="hover:text-text">
          {t('title')}
        </Link>
        {trail.map((n, i) => (
          <span key={n.id} className="flex items-center gap-1">
            <ChevronRight aria-hidden size={14} />
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-text">
                {name(n)}
              </span>
            ) : (
              <Link href={`/practice/node/${n.id}`} className="hover:text-text">
                {name(n)}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <h1 className="text-h1 font-bold text-text">{title}</h1>

      <AppCard className="flex flex-col gap-3 sm:flex-row">
        <AppButton
          fullWidth
          loading={practice.isPending}
          onClick={() =>
            practice.start({ mode: 'quick', node_ids: [id], question_count: 20 }, title)
          }
        >
          <Zap aria-hidden size={18} />
          {t('quick')}
        </AppButton>
        <AppButton
          fullWidth
          variant="secondary"
          loading={practice.isPending}
          onClick={() =>
            practice.start(
              { mode: 'custom', node_ids: [id], question_count: 20, duration_sec: 20 * 60 },
              title,
            )
          }
        >
          <Timer aria-hidden size={18} />
          {t('asExam')}
        </AppButton>
      </AppCard>
      <FormError message={practice.error ? errorText(practice.error) : null} />

      {children.isPending ? (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : children.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(children.error)}
            retryLabel={tc('retry')}
            onRetry={() => void children.refetch()}
          />
        </AppCard>
      ) : children.data.length === 0 ? (
        current && !current.has_children ? null : (
          <AppCard>
            <EmptyState title={t('noChildren')} />
          </AppCard>
        )
      ) : (
        <AppCard className="p-0">
          <ul className="divide-y divide-border">
            {children.data.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/practice/node/${n.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-surface-muted"
                >
                  <AccuracyRing pct={n.progress?.accuracy_pct ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-text">{name(n)}</p>
                    <p className="text-caption text-text-muted">
                      {t('questions', { count: formatDecimal(n.question_count ?? 0, locale, 0) })}
                    </p>
                  </div>
                  <ChevronRight aria-hidden size={18} className="text-text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </AppCard>
      )}
    </div>
  );
}
