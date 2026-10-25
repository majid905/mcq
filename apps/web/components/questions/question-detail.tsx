'use client';

import { AppCard, ErrorState, Skeleton } from '@mcq/ui';
import { useTranslations } from 'next-intl';
import { useErrorText } from '@/lib/hooks';
import { useQuestion } from '@/lib/practice/queries';
import { QuestionAnswer } from './question-answer';

/** F9 Single question for signed-in users (FR-SRCH-02): answer or PremiumLock. */
export function QuestionDetail({ id }: { id: string }) {
  const t = useTranslations('question');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const q = useQuestion(id);
  if (q.isPending) return <Skeleton aria-busy className="mx-auto h-96 max-w-reading rounded-lg" />;
  if (q.isError) {
    return (
      <AppCard className="mx-auto max-w-reading">
        <ErrorState
          message={errorText(q.error)}
          retryLabel={tc('retry')}
          onRetry={() => void q.refetch()}
        />
      </AppCard>
    );
  }
  return (
    <div className="mx-auto max-w-reading">
      <QuestionAnswer question={q.data} numberLabel={t('title')} defaultOpen />
    </div>
  );
}
