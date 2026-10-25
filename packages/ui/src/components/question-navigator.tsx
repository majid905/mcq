import { cn } from '../lib/cn';
import { fillTemplate, formatInteger } from '../lib/format';

export type NavigatorStatus = 'answered' | 'unanswered' | 'marked';

export interface NavigatorItem {
  /** 1-based question number. */
  number: number;
  status: NavigatorStatus;
}

export interface QuestionNavigatorLabels {
  answered: string;
  unanswered: string;
  marked: string;
  /** Cell name for screen readers, e.g. "প্রশ্ন {number}, {status}". */
  cell: string;
  /** Appended for the current cell, e.g. "বর্তমান প্রশ্ন". */
  current: string;
}

export interface QuestionNavigatorProps {
  items: NavigatorItem[];
  currentNumber?: number;
  labels: QuestionNavigatorLabels;
  locale: string;
  /** Jump to a question. Without it the grid is display-only. */
  onSelect?: (number: number) => void;
  className?: string;
}

const CELL: Record<NavigatorStatus, string> = {
  answered: 'border-primary bg-primary text-on-primary',
  unanswered: 'border-border-strong text-text-muted',
  marked: 'border-accent text-accent-text ring-2 ring-accent-soft',
};

/** Grid of numbered 40 px circles with a legend (docs/05 QuestionNavigator). */
export function QuestionNavigator({
  items,
  currentNumber,
  labels,
  locale,
  onSelect,
  className,
}: QuestionNavigatorProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul className="flex flex-wrap gap-3 text-caption text-text-muted" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-pill bg-primary" />
          {labels.answered}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-pill border-[1.5px] border-border-strong" />
          {labels.unanswered}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-pill border-[1.5px] border-accent" />
          {labels.marked}
        </li>
      </ul>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] gap-2">
        {items.map((item) => {
          const isCurrent = item.number === currentNumber;
          const name =
            fillTemplate(labels.cell, {
              number: formatInteger(item.number, locale),
              status: labels[item.status],
            }) + (isCurrent ? `, ${labels.current}` : '');
          const cellClass = cn(
            'grid size-10 place-items-center rounded-pill border-[1.5px] text-caption tabular-nums',
            CELL[item.status],
            isCurrent && 'border-[2.5px] border-text font-bold',
            isCurrent && item.status !== 'answered' && 'text-text',
          );
          return (
            <li key={item.number} className="grid place-items-center">
              {onSelect ? (
                <button
                  type="button"
                  aria-label={name}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => onSelect(item.number)}
                  className={cn(
                    cellClass,
                    'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                  )}
                >
                  {formatInteger(item.number, locale)}
                </button>
              ) : (
                <span role="img" aria-label={name} className={cellClass}>
                  {formatInteger(item.number, locale)}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
