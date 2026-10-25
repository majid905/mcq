'use client';

import {
  AppButton,
  AppCard,
  ScoreRing,
  Skeleton,
  StatTile,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { Check, Clock, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { buildRoomPaper } from '@/lib/exam/paper';
import { useAttemptResult } from '@/lib/exam/queries';
import { type PracticeSession, loadPracticeSession } from '@/lib/practice/session';
import { renderRichHtml } from '@/lib/rich-html';
import { useDurationText } from '@/lib/time';
import { useStartPractice } from './use-start-practice';

/** F4 Session summary (FR-PRAC-02): score, accuracy, time, wrong questions, practice again. */
export function SessionSummary({ attemptId }: { attemptId: string }) {
  const t = useTranslations('session');
  const locale = useLocale();
  const duration = useDurationText();
  const result = useAttemptResult(attemptId);
  const again = useStartPractice();
  const [session, setSession] = useState<PracticeSession | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSession(loadPracticeSession(attemptId)), 0);
    return () => clearTimeout(id);
  }, [attemptId]);

  // Local answers make the summary instant; the server result (when ready) wins for the numbers.
  const local = useMemo(() => {
    const answers = Object.values(session?.answers ?? {});
    const correct = answers.filter((a) => a.correct).length;
    return {
      total: session?.start.paper?.questions?.length ?? answers.length,
      correct,
      wrong: answers.length - correct,
      seconds: session?.finishedAt
        ? Math.round((session.finishedAt - session.startedAt) / 1000)
        : 0,
    };
  }, [session]);
  const wrongQuestions = useMemo(() => {
    if (!session?.start.paper) return [];
    const paper = buildRoomPaper(session.start.paper, session.start);
    return paper.order
      .filter((id) => session.answers[id] && !session.answers[id]!.correct)
      .map((id) => paper.questions[id]!);
  }, [session]);

  const r = result.data;
  const total = r?.total_questions ?? local.total;
  const correct = r?.correct ?? local.correct;
  const wrong = r?.wrong ?? local.wrong;
  const answered = correct + wrong;
  const n = (v: number) => formatInteger(v, locale);

  if (!session && result.isPending)
    return <Skeleton aria-busy className="mx-auto h-96 max-w-reading rounded-lg" />;

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4" data-testid="session-summary">
      <h1 className="text-center text-h2 font-semibold text-text">
        {session?.title ?? t('summaryTitle')}
      </h1>
      <ScoreRing
        className="mx-auto"
        score={correct}
        total={total || 1}
        format={(v) => n(Math.round(v))}
        caption={`/${n(total)}`}
        label={t('scoreLabel', { correct: n(correct), total: n(total) })}
      />
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label={t('correct')}
          value={n(correct)}
          tone="success"
          icon={<Check aria-hidden size={18} />}
        />
        <StatTile
          label={t('wrong')}
          value={n(wrong)}
          tone="danger"
          icon={<X aria-hidden size={18} />}
        />
        <StatTile
          label={t('time')}
          value={duration(r?.time_taken_sec ?? local.seconds)}
          icon={<Clock aria-hidden size={16} />}
        />
      </div>
      <p className="text-center text-body-sm text-text-muted">
        {t('accuracy', {
          pct: formatDecimal(answered ? (correct / answered) * 100 : 0, locale, 0),
        })}
      </p>

      {wrongQuestions.length > 0 && (
        <AppCard>
          <h2 className="text-h3 font-semibold text-text">{t('wrongList')}</h2>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {wrongQuestions.map((q) => (
              <li key={q.id} className="py-2.5">
                <Link
                  href={`/questions/${q.id}`}
                  className="mcq-html block text-body-sm text-text hover:text-primary"
                >
                  <span dangerouslySetInnerHTML={{ __html: renderRichHtml(q.body) }} />
                </Link>
              </li>
            ))}
          </ul>
        </AppCard>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {session && (
          <AppButton
            fullWidth
            className="sm:flex-1"
            loading={again.isPending}
            onClick={() => again.start(session.request, session.title)}
          >
            {t('again')}
          </AppButton>
        )}
        <AppButton asChild variant="secondary" fullWidth className="sm:flex-1">
          <Link href="/practice">{t('newTopic')}</Link>
        </AppButton>
      </div>
    </div>
  );
}
