'use client';

import {
  AppButton,
  AppCard,
  OPTION_LABELS,
  OptionTile,
  PremiumLock,
  QuestionCard,
  cn,
  formatDecimal,
} from '@mcq/ui';
import { Bookmark, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { type Question, useBookmarkToggle } from '@/lib/practice/queries';
import { renderRichHtml } from '@/lib/rich-html';

/**
 * Read-only question with its answer (F8, F9, search, question bank). When the API hides the
 * answer (premium or quota, `answer_locked`), the options stay visible and a PremiumLock asks to
 * upgrade instead.
 */
export function QuestionAnswer({
  question: q,
  numberLabel,
  showBookmark = true,
  defaultOpen = false,
}: {
  question: Question;
  numberLabel: string;
  showBookmark?: boolean;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('question');
  const locale = useLocale();
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const [open, setOpen] = useState(defaultOpen);
  const bookmark = useBookmarkToggle();
  const [bookmarked, setBookmarked] = useState(Boolean(q.is_bookmarked));
  const locked = q.answer_locked || !q.correct_option;

  return (
    <AppCard data-testid="question-answer">
      <QuestionCard
        interactive={false}
        numberLabel={numberLabel}
        topic={
          q.source_label ??
          (q.topic ? (locale === 'bn' ? q.topic.name_bn : q.topic.name_en) : undefined)
        }
        bodyHtml={renderRichHtml(q.body)}
        actions={
          showBookmark && q.id ? (
            <button
              type="button"
              aria-pressed={bookmarked}
              aria-label={bookmarked ? t('unbookmark') : t('bookmark')}
              onClick={() => {
                const on = !bookmarked;
                setBookmarked(on);
                bookmark.mutate({ id: q.id ?? '', on }, { onError: () => setBookmarked(!on) });
              }}
              className={cn(
                'grid size-10 place-items-center rounded-md hover:bg-surface-muted',
                bookmarked ? 'text-primary' : 'text-text-muted',
              )}
            >
              <Bookmark aria-hidden size={18} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
          ) : null
        }
        footer={
          locked ? (
            <PremiumLock
              title={t('locked')}
              cta={
                <AppButton asChild size="sm">
                  <Link href="/plans">{t('seePlans')}</Link>
                </AppButton>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {q.stats?.correct_pct !== null && q.stats?.correct_pct !== undefined && (
                <p className="text-caption text-text-muted">
                  {t('correctPct', { pct: formatDecimal(q.stats.correct_pct, locale, 0) })}
                </p>
              )}
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
                      dangerouslySetInnerHTML={{ __html: renderRichHtml(q.explanation) }}
                    />
                  )}
                </div>
              )}
              {q.topic?.id && (
                <Link
                  href={`/practice/node/${q.topic.id}`}
                  className="text-body-sm font-medium text-primary hover:underline"
                >
                  {t('moreLikeThis')}
                </Link>
              )}
            </div>
          )
        }
      >
        {(q.options ?? []).map((o, i) => (
          <OptionTile
            key={o.key}
            label={labels[i] ?? o.key}
            state={!locked && o.key === q.correct_option ? 'correct' : 'idle'}
            statusLabel={!locked && o.key === q.correct_option ? t('correctAnswer') : undefined}
          >
            <span
              className="mcq-html"
              dangerouslySetInnerHTML={{ __html: renderRichHtml(o.html) }}
            />
          </OptionTile>
        ))}
      </QuestionCard>
    </AppCard>
  );
}
