'use client';

import {
  AppButton,
  AppCard,
  EmptyState,
  ErrorState,
  OPTION_LABELS,
  OptionTile,
  QuestionCard,
  Skeleton,
  cn,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Eye, Timer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { useApi } from '@/components/providers';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { unwrap } from '@/lib/api';
import { useErrorText } from '@/lib/hooks';
import { useSourceExams } from '@/lib/practice/queries';
import { useCategories, useMe } from '@/lib/queries';
import { renderRichHtml } from '@/lib/rich-html';

/** F6 Question bank (FR-PRAC-04): category tabs, previous-year papers. */
export function BankList() {
  const t = useTranslations('bank');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const categories = useCategories();
  const me = useMe();
  const ordered = useMemo(() => {
    const goals = new Set(me.data?.target_node_ids ?? []);
    return [...(categories.data ?? [])].sort(
      (a, b) => Number(goals.has(b.id ?? '')) - Number(goals.has(a.id ?? '')),
    );
  }, [categories.data, me.data]);
  const active = params.get('category') ?? ordered[0]?.id ?? null;
  const papers = useSourceExams(active);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <div
        role="tablist"
        aria-label={t('categories')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {ordered.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={c.id === active}
            onClick={() =>
              router.replace({ pathname, query: { category: c.id ?? '' } }, { scroll: false })
            }
            className={cn(
              'h-10 whitespace-nowrap rounded-pill border px-4 text-body-sm font-medium',
              c.id === active
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-surface text-text-muted hover:text-text',
            )}
          >
            {locale === 'bn' ? c.name_bn : c.name_en}
          </button>
        ))}
      </div>
      {papers.isPending ? (
        <Skeleton aria-busy className="h-64 rounded-lg" />
      ) : papers.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(papers.error)}
            retryLabel={tc('retry')}
            onRetry={() => void papers.refetch()}
          />
        </AppCard>
      ) : papers.data.length === 0 ? (
        <AppCard>
          <EmptyState title={t('empty')} />
        </AppCard>
      ) : (
        <AppCard className="p-0">
          <ul className="divide-y divide-border">
            {papers.data.map((p) => (
              <li key={p.id}>
                <Link
                  href={{
                    pathname: `/bank/${p.id}`,
                    query: {
                      ...(p.paper_exam_id ? { exam: p.paper_exam_id } : {}),
                      title: (locale === 'bn' ? p.name_bn : p.name_en) ?? '',
                    },
                  }}
                  data-testid="bank-paper"
                  className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-text">
                      {locale === 'bn' ? p.name_bn : p.name_en} —{' '}
                      {formatInteger(p.year ?? 0, locale)}
                    </p>
                    <p className="text-caption text-text-muted">
                      {t('questions', { count: formatDecimal(p.question_count ?? 0, locale, 0) })}
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

/**
 * F7 Paper view (FR-PRAC-04). Read mode lists the paper's questions; each opens F9 with its
 * answer (the API has no "paper with answers" endpoint yet). "টাইমড পরীক্ষা দিন" takes the paper
 * as an exam through D3.
 */
export function BankPaper() {
  const t = useTranslations('bank');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorText = useErrorText();
  const params = useSearchParams();
  const examId = params.get('exam');
  const title = params.get('title') ?? t('title');
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;

  const paper = useQuery({
    queryKey: ['paper', examId],
    enabled: Boolean(examId),
    queryFn: () => unwrap(api.GET('/exams/{id}/paper', { params: { path: { id: examId ?? '' } } })),
  });

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{title}</h1>
      {!examId ? (
        <AppCard>
          <EmptyState title={t('notAvailable')} />
        </AppCard>
      ) : (
        <>
          <AppButton asChild>
            <Link href={{ pathname: `/exams/${examId}/instructions`, query: { mode: 'practice' } }}>
              <Timer aria-hidden size={18} />
              {t('timed')}
            </Link>
          </AppButton>
          {paper.isPending ? (
            <Skeleton aria-busy className="h-96 rounded-lg" />
          ) : paper.isError ? (
            <AppCard>
              <ErrorState
                message={errorText(paper.error)}
                retryLabel={tc('retry')}
                onRetry={() => void paper.refetch()}
              />
            </AppCard>
          ) : (
            (paper.data.questions ?? []).map((q, i) => (
              <AppCard key={q.id}>
                <QuestionCard
                  interactive={false}
                  numberLabel={t('questionN', { n: formatInteger(i + 1, locale) })}
                  bodyHtml={renderRichHtml(q.body)}
                  footer={
                    <AppButton asChild variant="ghost" size="sm" className="self-start">
                      <Link href={`/questions/${q.id}`}>
                        <Eye aria-hidden size={16} />
                        {t('showAnswer')}
                      </Link>
                    </AppButton>
                  }
                >
                  {(q.options ?? []).map((o, oi) => (
                    <OptionTile key={o.key} label={labels[oi] ?? o.key}>
                      <span
                        className="mcq-html"
                        dangerouslySetInnerHTML={{ __html: renderRichHtml(o.html) }}
                      />
                    </OptionTile>
                  ))}
                </QuestionCard>
              </AppCard>
            ))
          )}
        </>
      )}
    </div>
  );
}
