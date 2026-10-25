'use client';

import {
  AppCard,
  EmptyState,
  ErrorState,
  OPTION_LABELS,
  OptionTile,
  type OptionTileState,
  QuestionCard,
  SegmentedControl,
  Skeleton,
  cn,
  formatInteger,
} from '@mcq/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/components/providers';
import { expectOk } from '@/lib/api';
import { type SolutionFilter, type SolutionItem, examKeys, useSolutions } from '@/lib/exam/queries';
import { useErrorText } from '@/lib/hooks';

const FILTERS: SolutionFilter[] = ['all', 'wrong', 'skipped', 'correct'];

function optionState(key: string, item: SolutionItem): OptionTileState {
  const correct = item.question?.correct_option;
  if (key === correct) return item.my_answer === key ? 'correct' : 'missed';
  if (key === item.my_answer) return 'wrong';
  return 'idle';
}

function SolutionCard({
  item,
  attemptId,
  filter,
}: {
  item: SolutionItem;
  attemptId: string;
  filter: SolutionFilter;
}) {
  const t = useTranslations('solutions');
  const locale = useLocale();
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = item.question;
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;

  const bookmark = useMutation({
    mutationFn: (on: boolean) => {
      const params = { params: { path: { id: q?.id ?? '' } } };
      return expectOk(
        on ? api.PUT('/bookmarks/{id}', params) : api.DELETE('/bookmarks/{id}', params),
      );
    },
    onSuccess: (_d, on) => {
      const key = examKeys.solutions(attemptId, filter);
      qc.setQueryData<SolutionItem[]>(key, (prev) =>
        prev?.map((s) =>
          s.question?.id === q?.id && s.question
            ? { ...s, question: { ...s.question, is_bookmarked: on } }
            : s,
        ),
      );
    },
  });
  if (!q) return null;

  const myIndex = (q.options ?? []).findIndex((o) => o.key === item.my_answer);
  return (
    <AppCard data-testid="solution" data-result={item.result}>
      <QuestionCard
        interactive={false}
        numberLabel={t('questionN', { n: formatInteger(item.position ?? 0, locale) })}
        topic={q.topic ? (locale === 'bn' ? q.topic.name_bn : q.topic.name_en) : undefined}
        bodyHtml={q.body ?? ''}
        actions={
          <button
            type="button"
            aria-pressed={Boolean(q.is_bookmarked)}
            aria-label={q.is_bookmarked ? t('unbookmark') : t('bookmark')}
            onClick={() => bookmark.mutate(!q.is_bookmarked)}
            className={cn(
              'grid size-10 place-items-center rounded-md hover:bg-surface-muted',
              q.is_bookmarked ? 'text-primary' : 'text-text-muted',
            )}
          >
            <Bookmark aria-hidden size={18} fill={q.is_bookmarked ? 'currentColor' : 'none'} />
          </button>
        }
        footer={
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-text-muted">
              {item.my_answer && myIndex >= 0
                ? t('yourAnswer', { label: labels[myIndex] ?? item.my_answer })
                : t('notAnswered')}
            </p>
            {q.explanation && (
              <div>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-body-sm font-semibold text-primary"
                >
                  {t('explanation')}
                  <ChevronDown
                    aria-hidden
                    size={16}
                    className={cn('transition-transform', open && 'rotate-180')}
                  />
                </button>
                {open && (
                  <div
                    className="mcq-html mt-2 rounded-md bg-surface-muted p-3 text-body-sm leading-relaxed text-text"
                    dangerouslySetInnerHTML={{ __html: q.explanation }}
                  />
                )}
              </div>
            )}
          </div>
        }
      >
        {(q.options ?? []).map((o, i) => {
          const state = optionState(o.key, item);
          return (
            <OptionTile
              key={o.key}
              label={labels[i] ?? o.key}
              state={state}
              statusLabel={
                state === 'correct'
                  ? t('correct')
                  : state === 'wrong'
                    ? t('wrong')
                    : state === 'missed'
                      ? t('missed')
                      : undefined
              }
            >
              <span className="mcq-html" dangerouslySetInnerHTML={{ __html: o.html }} />
            </OptionTile>
          );
        })}
      </QuestionCard>
    </AppCard>
  );
}

/** E2 Solutions (FR-RES-05). Original option order, so labels match the answer key. */
export function SolutionsView({ attemptId }: { attemptId: string }) {
  const t = useTranslations('solutions');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const [filter, setFilter] = useState<SolutionFilter>('all');
  const solutions = useSolutions(attemptId, filter);

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <SegmentedControl
        label={t('filter')}
        value={filter}
        onValueChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: t(`filters.${f}`) }))}
        className="self-start"
      />
      {solutions.isPending ? (
        <div aria-busy className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : solutions.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(solutions.error)}
            retryLabel={tc('retry')}
            onRetry={() => void solutions.refetch()}
          />
        </AppCard>
      ) : solutions.data.length === 0 ? (
        <AppCard>
          <EmptyState title={t(`empty.${filter}`)} />
        </AppCard>
      ) : (
        solutions.data.map((item) => (
          <SolutionCard
            key={item.question?.id ?? item.position}
            item={item}
            attemptId={attemptId}
            filter={filter}
          />
        ))
      )}
    </div>
  );
}
