import { type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';
import { AppChip } from './app-chip';

export interface QuestionCardProps {
  /** e.g. "প্রশ্ন ১২/১০০". */
  numberLabel: string;
  /** Section or topic name. */
  topic?: string;
  /**
   * Question stem as HTML. The API sanitizes question HTML when it is saved (admin editor), so it
   * is rendered as is; it may hold KaTeX spans and images.
   */
  bodyHtml: string;
  /** Icon buttons on the right of the header (mark for review, bookmark, report). */
  actions?: ReactNode;
  /** OptionTiles. */
  children: ReactNode;
  /** Extra content under the options (explanation, "your answer"). */
  footer?: ReactNode;
  /** Options are radios only while answering; review screens pass false. */
  interactive?: boolean;
  id?: string;
  className?: string;
}

/** docs/05 QuestionCard: number chip, topic, rich body, options. Question text is the hero. */
export function QuestionCard({
  numberLabel,
  topic,
  bodyHtml,
  actions,
  children,
  footer,
  interactive = true,
  id,
  className,
}: QuestionCardProps) {
  const stemId = useId();
  return (
    <article id={id} aria-labelledby={stemId} className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <AppChip variant="primary">{numberLabel}</AppChip>
        <div className="flex min-w-0 items-center gap-1">
          {topic && <span className="truncate text-caption text-text-muted">{topic}</span>}
          {actions}
        </div>
      </div>
      <div
        id={stemId}
        className="mcq-html text-question font-medium text-text"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <div
        role={interactive ? 'radiogroup' : 'list'}
        aria-labelledby={stemId}
        className="flex flex-col gap-2"
      >
        {children}
      </div>
      {footer}
    </article>
  );
}
