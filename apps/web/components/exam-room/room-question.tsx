'use client';

import { OPTION_LABELS, OptionTile, QuestionCard, cn, formatInteger } from '@mcq/ui';
import { Flag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useStore } from 'zustand';
import type { RoomStore } from '@/lib/exam/room-store';
import { renderRichHtml } from '@/lib/rich-html';

/** One question with its options, bound to the room store. */
export function RoomQuestion({
  store,
  questionId,
  index,
  id,
}: {
  store: RoomStore;
  questionId: string;
  index: number;
  id?: string;
}) {
  const t = useTranslations('room');
  const locale = useLocale();
  const q = useStore(store, (s) => s.paper?.questions[questionId]);
  const section = useStore(store, (s) => (q ? s.paper?.sections[q.section]?.label : undefined));
  const total = useStore(store, (s) => s.paper?.order.length ?? 0);
  const answer = useStore(store, (s) => s.answers[questionId]);
  const marked = useStore(store, (s) => s.marked.includes(questionId));
  const labels = useStore(store, (s) => OPTION_LABELS[s.labels]);
  const select = useStore(store, (s) => s.select);
  const go = useStore(store, (s) => s.go);
  const toggleMark = useStore(store, (s) => s.toggleMark);
  if (!q) return null;

  return (
    <QuestionCard
      id={id}
      numberLabel={t('questionN', {
        n: formatInteger(index + 1, locale),
        total: formatInteger(total, locale),
      })}
      topic={section || undefined}
      bodyHtml={renderRichHtml(q.body)}
      actions={
        <button
          type="button"
          aria-pressed={marked}
          aria-label={marked ? t('unmark') : t('mark')}
          title={marked ? t('unmark') : t('mark')}
          onClick={() => toggleMark(questionId)}
          className={cn(
            'grid size-10 place-items-center rounded-md',
            'focus-visible:outline-2 focus-visible:outline-focus-ring',
            marked ? 'bg-accent-soft text-accent-text' : 'text-text-muted hover:bg-surface-muted',
          )}
        >
          <Flag
            aria-hidden
            size={18}
            strokeWidth={marked ? 2.5 : 1.75}
            fill={marked ? 'currentColor' : 'none'}
          />
        </button>
      }
    >
      {q.options.map((o, i) => (
        <OptionTile
          key={o.key}
          label={labels[i] ?? String(i + 1)}
          state={answer === o.key ? 'selected' : 'idle'}
          onSelect={() => {
            select(questionId, o.key);
            // Keyboard shortcuts act on the question last answered (OMR mode).
            go(index);
          }}
        >
          <span className="mcq-html" dangerouslySetInnerHTML={{ __html: renderRichHtml(o.html) }} />
        </OptionTile>
      ))}
    </QuestionCard>
  );
}
