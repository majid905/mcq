'use client';

import { AppButton } from '@mcq/ui';
import { CheckCircle2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAttemptResult, useExamDetail } from '@/lib/exam/queries';
import { forgetRoom } from '@/lib/exam/room-store';
import { useServerNow } from '@/lib/time';

function ResultPublishLine({ examId }: { examId: string }) {
  const t = useTranslations('submitted');
  const format = useFormatter();
  const exam = useExamDetail(examId);
  const now = useServerNow(undefined, 60_000);
  const at = exam.data?.result_publish_at;
  if (!at || Date.parse(at) < now) return null;
  return (
    <p className="text-body-sm text-text-muted">
      {t('meritAt', {
        time: format.dateTime(new Date(at), {
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
        }),
      })}
    </p>
  );
}

/** D5 Submitted (FR-RES-01): polls the result every 3 s, then opens it. */
export function Submitted({ attemptId }: { attemptId: string }) {
  const t = useTranslations('submitted');
  const router = useRouter();
  const examId = useSearchParams().get('exam');
  const result = useAttemptResult(attemptId);

  useEffect(() => {
    if (!result.data) return;
    // The answers are on the server now; drop the local copy.
    void forgetRoom(attemptId).then(() => router.replace(`/results/${attemptId}`));
  }, [result.data, attemptId, router]);

  const waiting = result.data === null || result.isPending;
  return (
    <div
      className="mx-auto flex max-w-110 flex-col items-center gap-4 px-4 py-16 text-center"
      aria-live="polite"
    >
      <span className="grid size-20 place-items-center rounded-pill bg-success-soft text-success motion-safe:animate-[mcq-badge-pop_var(--mcq-duration-slow)_var(--mcq-easing-emphasized)]">
        <CheckCircle2 aria-hidden size={44} strokeWidth={1.75} />
      </span>
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <p className="text-body text-text-muted">{waiting ? t('scoring') : t('ready')}</p>
      {examId && <ResultPublishLine examId={examId} />}
      {!result.isFetching && result.data === null && (
        <AppButton variant="secondary" onClick={() => void result.refetch()}>
          {t('checkAgain')}
        </AppButton>
      )}
      <AppButton asChild variant="ghost">
        <Link href="/home">{t('home')}</Link>
      </AppButton>
    </div>
  );
}
