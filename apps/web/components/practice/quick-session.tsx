'use client';

import {
  AppButton,
  AppCard,
  EmptyState,
  OPTION_LABELS,
  OptionTile,
  type OptionTileState,
  PremiumLock,
  ProgressBar,
  QuestionCard,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, unwrap } from '@/lib/api';
import { buildRoomPaper } from '@/lib/exam/paper';
import type { OptionKey } from '@/lib/exam/paper';
import { useErrorText } from '@/lib/hooks';
import {
  type PracticeSession,
  loadPracticeSession,
  savePracticeSession,
} from '@/lib/practice/session';
import { renderRichHtml } from '@/lib/rich-html';

/** F3 Quick practice (FR-PRAC-02): one question at a time, the answer is revealed at once. */
export function QuickSession({ attemptId }: { attemptId: string }) {
  const t = useTranslations('session');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const errorText = useErrorText();
  const [session, setSession] = useState<PracticeSession | null | undefined>(undefined);

  useEffect(() => {
    const id = setTimeout(() => setSession(loadPracticeSession(attemptId)), 0);
    return () => clearTimeout(id);
  }, [attemptId]);

  const paper = useMemo(
    () => (session?.start.paper ? buildRoomPaper(session.start.paper, session.start) : null),
    [session],
  );

  const update = (next: PracticeSession) => {
    savePracticeSession(next);
    setSession(next);
  };

  const answer = useMutation({
    mutationFn: (v: { questionId: string; option: OptionKey }) =>
      unwrap(
        api.POST('/practice/sessions/{id}/answer', {
          params: { path: { id: attemptId } },
          body: { question_id: v.questionId, option: v.option },
        }),
      ),
    onSuccess: (res, v) => {
      if (!session) return;
      update({
        ...session,
        answers: {
          ...session.answers,
          [v.questionId]: {
            option: v.option,
            // The key decides; is_correct only when the API sends no key.
            correct: res.correct_option ? res.correct_option === v.option : Boolean(res.is_correct),
            correctOption: (res.correct_option ?? v.option) as OptionKey,
            explanation: res.explanation ?? null,
          },
        },
      });
    },
  });

  const finish = useMutation({
    mutationFn: async () => {
      if (!session) return;
      const answers = Object.fromEntries(
        Object.entries(session.answers).map(([q, a]) => [q, a.option]),
      );
      try {
        await unwrap(
          api.POST('/attempts/{id}/submit', {
            params: { path: { id: attemptId } },
            body: { answers },
          }),
        );
      } catch (e) {
        // Already closed: the server has the answers from the answer calls.
        if (!(e instanceof ApiError && e.code === 'ATTEMPT_CLOSED')) throw e;
      }
      update({ ...session, finishedAt: Date.now() });
    },
    onSuccess: () => router.replace(`/practice/session/${attemptId}/summary`),
  });

  if (session === undefined) return null;
  if (session === null || !paper) {
    return (
      <AppCard className="mx-auto max-w-reading">
        <EmptyState
          title={t('missingTitle')}
          description={t('missingBody')}
          action={
            <AppButton asChild size="sm">
              <Link href="/practice">{t('backToPractice')}</Link>
            </AppButton>
          }
        />
      </AppCard>
    );
  }

  const total = paper.order.length;
  const index = Math.min(session.index, total - 1);
  const qid = paper.order[index]!;
  const q = paper.questions[qid]!;
  const checked = session.answers[qid];
  const answeredCount = Object.keys(session.answers).length;
  const correctCount = Object.values(session.answers).filter((a) => a.correct).length;
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const n = (v: number) => formatInteger(v, locale);
  const quotaHit = answer.error instanceof ApiError && answer.error.status === 402;

  const stateOf = (key: OptionKey): OptionTileState => {
    if (!checked) return answer.isPending && answer.variables?.option === key ? 'selected' : 'idle';
    if (key === checked.correctOption) return checked.option === key ? 'correct' : 'missed';
    if (key === checked.option) return 'wrong';
    return 'idle';
  };

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4" data-testid="quick-session">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-h3 font-semibold text-text">{session.title}</h1>
          <span
            className="text-body-sm tabular-nums text-text-muted"
            data-testid="session-progress"
          >
            {t('progress', { done: n(answeredCount), total: n(total) })}
            {answeredCount > 0 &&
              ` · ${t('accuracy', { pct: formatDecimal((correctCount / answeredCount) * 100, locale, 0) })}`}
          </span>
        </div>
        <ProgressBar value={answeredCount} max={total} label={t('progressLabel')} />
      </div>

      <AppCard>
        <QuestionCard
          interactive={!checked}
          numberLabel={t('questionN', { n: n(index + 1), total: n(total) })}
          topic={paper.sections[q.section]?.label || undefined}
          bodyHtml={renderRichHtml(q.body)}
          footer={
            checked ? (
              <div
                role="status"
                className={
                  checked.correct
                    ? 'rounded-md bg-success-soft p-3 motion-safe:animate-[mcq-badge-pop_var(--mcq-duration-base)_var(--mcq-easing-standard)]'
                    : 'rounded-md bg-danger-soft p-3 motion-safe:animate-[mcq-badge-pop_var(--mcq-duration-base)_var(--mcq-easing-standard)]'
                }
              >
                <p
                  className={
                    checked.correct
                      ? 'flex items-center gap-2 font-semibold text-success'
                      : 'flex items-center gap-2 font-semibold text-danger'
                  }
                >
                  {checked.correct ? <Check aria-hidden size={18} /> : <X aria-hidden size={18} />}
                  {checked.correct ? t('right') : t('notRight')}
                </p>
                {checked.explanation && (
                  <div
                    className="mcq-html mt-2 text-body-sm leading-relaxed text-text"
                    dangerouslySetInnerHTML={{ __html: renderRichHtml(checked.explanation) }}
                  />
                )}
              </div>
            ) : quotaHit ? (
              <PremiumLock
                title={t('quota')}
                cta={
                  <AppButton asChild size="sm">
                    <Link href="/plans">{t('seePlans')}</Link>
                  </AppButton>
                }
              />
            ) : (
              <FormError message={answer.isError ? errorText(answer.error) : null} />
            )
          }
        >
          {q.options.map((o, i) => {
            const state = stateOf(o.key);
            return (
              <OptionTile
                key={o.key}
                label={labels[i] ?? o.key}
                state={state}
                disabled={answer.isPending}
                statusLabel={
                  state === 'correct'
                    ? t('correct')
                    : state === 'wrong'
                      ? t('wrong')
                      : state === 'missed'
                        ? t('missed')
                        : undefined
                }
                onSelect={
                  checked ? undefined : () => answer.mutate({ questionId: qid, option: o.key })
                }
              >
                <span
                  className="mcq-html"
                  dangerouslySetInnerHTML={{ __html: renderRichHtml(o.html) }}
                />
              </OptionTile>
            );
          })}
        </QuestionCard>
      </AppCard>

      <FormError message={finish.isError ? errorText(finish.error) : null} />
      <div className="flex gap-3">
        <AppButton
          variant="secondary"
          fullWidth
          loading={finish.isPending}
          onClick={() => finish.mutate()}
        >
          {t('finish')}
        </AppButton>
        {index < total - 1 ? (
          <AppButton
            fullWidth
            disabled={!checked}
            onClick={() => update({ ...session, index: index + 1 })}
          >
            {t('next')}
          </AppButton>
        ) : (
          <AppButton
            fullWidth
            disabled={!checked}
            loading={finish.isPending}
            onClick={() => finish.mutate()}
          >
            {t('seeSummary')}
          </AppButton>
        )}
      </div>
    </div>
  );
}
