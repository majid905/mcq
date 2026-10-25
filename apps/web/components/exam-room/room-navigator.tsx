'use client';

import { AppButton, QuestionNavigator, formatInteger } from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { RoomStore } from '@/lib/exam/room-store';

export function useCounts(store: RoomStore) {
  const order = useStore(store, (s) => s.paper?.order);
  const answers = useStore(store, (s) => s.answers);
  const marked = useStore(store, (s) => s.marked);
  return useMemo(() => {
    const total = order?.length ?? 0;
    const answered = (order ?? []).filter((id) => answers[id]).length;
    return { total, answered, unanswered: total - answered, marked: marked.length };
  }, [order, answers, marked]);
}

/** Grid per section + legend + submit (right panel ≥ 1024 px, sheet below). */
export function RoomNavigator({
  store,
  onJump,
  onSubmit,
}: {
  store: RoomStore;
  onJump: (index: number) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('room');
  const locale = useLocale();
  const paper = useStore(store, (s) => s.paper);
  const answers = useStore(store, (s) => s.answers);
  const marked = useStore(store, (s) => s.marked);
  const current = useStore(store, (s) => s.current);
  const counts = useCounts(store);
  if (!paper) return null;

  const labels = {
    answered: t('legend.answered'),
    unanswered: t('legend.unanswered'),
    marked: t('legend.marked'),
    cell: t.raw('navCell') as string,
    current: t('navCurrent'),
  };
  const starts = paper.sections.map((_, i) =>
    paper.sections.slice(0, i).reduce((sum, sec) => sum + sec.questionIds.length, 0),
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-body font-semibold text-text">{t('questionList')}</h2>
      {paper.sections.map((section, si) => {
        const start = starts[si] ?? 0;
        return (
          <div key={section.nodeId + si} className="flex flex-col gap-2">
            {section.label && (
              <p className="text-caption font-semibold text-text-muted">{section.label}</p>
            )}
            <QuestionNavigator
              locale={locale}
              labels={labels}
              currentNumber={current + 1}
              showLegend={si === 0}
              onSelect={(n) => onJump(n - 1)}
              items={section.questionIds.map((id, i) => ({
                number: start + i + 1,
                status: marked.includes(id) ? 'marked' : answers[id] ? 'answered' : 'unanswered',
              }))}
            />
          </div>
        );
      })}
      <p className="text-caption text-text-muted" aria-live="polite">
        {t('countsLine', {
          answered: formatInteger(counts.answered, locale),
          unanswered: formatInteger(counts.unanswered, locale),
          marked: formatInteger(counts.marked, locale),
        })}
      </p>
      <AppButton fullWidth onClick={onSubmit}>
        {t('submit')}
      </AppButton>
    </div>
  );
}
