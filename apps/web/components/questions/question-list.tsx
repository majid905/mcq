'use client';

import { AppButton, AppCard, EmptyState, ErrorState, Skeleton, formatInteger } from '@mcq/ui';
import { Zap } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormError } from '@/components/auth/fields';
import { useStartPractice } from '@/components/practice/use-start-practice';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useQuestionList } from '@/lib/practice/queries';
import { QuestionAnswer } from './question-answer';

/** F8 Bookmarks and wrong answers (FR-PRAC-05), with "practice these". */
export function QuestionList({ kind }: { kind: 'bookmarks' | 'wrong' }) {
  const t = useTranslations('lists');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const list = useQuestionList(kind);
  const practice = useStartPractice();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 font-bold text-text">{t(`${kind}.title`)}</h1>
        {items.length > 0 && (
          <AppButton
            size="sm"
            loading={practice.isPending}
            onClick={() =>
              practice.start(
                { mode: kind, question_count: Math.min(50, Math.max(5, items.length)) },
                t(`${kind}.title`),
              )
            }
          >
            <Zap aria-hidden size={16} />
            {t('practiceThese')}
          </AppButton>
        )}
      </div>
      {kind === 'wrong' && <p className="text-body-sm text-text-muted">{t('wrong.help')}</p>}
      <FormError message={practice.error ? errorText(practice.error) : null} />
      {list.isPending ? (
        <div aria-busy className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : list.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(list.error)}
            retryLabel={tc('retry')}
            onRetry={() => void list.refetch()}
          />
        </AppCard>
      ) : items.length === 0 ? (
        <AppCard>
          <EmptyState
            title={t(`${kind}.empty`)}
            description={t(`${kind}.emptyBody`)}
            action={
              <AppButton asChild size="sm">
                <Link href="/practice">{t('goPractice')}</Link>
              </AppButton>
            }
          />
        </AppCard>
      ) : (
        <>
          {items.map((q, i) => (
            <QuestionAnswer
              key={q.id}
              question={q}
              numberLabel={t('questionN', { n: formatInteger(i + 1, locale) })}
            />
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
  );
}
