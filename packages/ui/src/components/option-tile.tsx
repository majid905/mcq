import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type OptionTileState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

/** Option labels by locale: ক খ গ ঘ ঙ in Bangla (docs/05 §1). */
export const OPTION_LABELS = {
  bn: ['ক', 'খ', 'গ', 'ঘ', 'ঙ'],
  en: ['A', 'B', 'C', 'D', 'E'],
} as const;

// Colours come from the generated --mcq-option-<state>-* variables (design/tokens.json "option").
const STATE_CLASSES: Record<OptionTileState, { tile: string; badge: string }> = {
  idle: {
    tile: 'bg-[var(--mcq-option-idle-bg)] border-[var(--mcq-option-idle-border)] hover:border-border-strong',
    badge: 'bg-[var(--mcq-option-idle-badge-bg)] text-[var(--mcq-option-idle-badge-text)]',
  },
  selected: {
    tile: 'bg-[var(--mcq-option-selected-bg)] border-[var(--mcq-option-selected-border)]',
    badge: 'bg-[var(--mcq-option-selected-badge-bg)] text-[var(--mcq-option-selected-badge-text)]',
  },
  correct: {
    tile: 'bg-[var(--mcq-option-correct-bg)] border-[var(--mcq-option-correct-border)]',
    badge: 'bg-[var(--mcq-option-correct-badge-bg)] text-[var(--mcq-option-correct-badge-text)]',
  },
  wrong: {
    tile: 'bg-[var(--mcq-option-wrong-bg)] border-[var(--mcq-option-wrong-border)]',
    badge: 'bg-[var(--mcq-option-wrong-badge-bg)] text-[var(--mcq-option-wrong-badge-text)]',
  },
  missed: {
    tile: 'bg-[var(--mcq-option-missed-bg)] border-[var(--mcq-option-missed-border)]',
    badge: 'bg-[var(--mcq-option-missed-badge-bg)] text-[var(--mcq-option-missed-badge-text)]',
  },
};

export interface OptionTileProps {
  /** Badge text, e.g. OPTION_LABELS.bn[0]. */
  label: string;
  children: ReactNode;
  state?: OptionTileState;
  /** When set the tile is a radio button; without it the tile is read-only (solutions view). */
  onSelect?: () => void;
  disabled?: boolean;
  /**
   * Screen reader text for correct / wrong / missed, e.g. "সঠিক উত্তর". Status is also shown with an
   * icon, never by colour alone (docs/05 §1).
   */
  statusLabel?: string;
  className?: string;
}

export function OptionTile({
  label,
  children,
  state = 'idle',
  onSelect,
  disabled,
  statusLabel,
  className,
}: OptionTileProps) {
  const s = STATE_CLASSES[state];
  const StatusIcon =
    state === 'wrong' ? X : state === 'correct' || state === 'missed' ? Check : null;
  const iconColor = state === 'wrong' ? 'text-danger' : 'text-success';

  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          'grid size-8 flex-none place-items-center rounded-pill font-bangla text-body-sm font-semibold',
          'transition-[background-color,color,transform] duration-[var(--mcq-duration-fast)] ease-emphasized',
          state === 'selected' &&
            'motion-safe:animate-[mcq-badge-pop_var(--mcq-duration-fast)_var(--mcq-easing-emphasized)]',
          s.badge,
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-option text-text">{children}</span>
      {StatusIcon && (
        <span className={cn('flex flex-none items-center', iconColor)}>
          <StatusIcon aria-hidden size={20} strokeWidth={2} />
          {statusLabel && <span className="sr-only">{statusLabel}</span>}
        </span>
      )}
    </>
  );

  const classes = cn(
    'flex min-h-14 w-full items-center gap-3 rounded-md border-[1.5px] px-3 py-2.5 text-left',
    'transition-colors duration-[var(--mcq-duration-fast)] ease-standard',
    s.tile,
    className,
  );

  if (!onSelect) {
    return (
      <div data-state={state} className={classes}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state === 'selected'}
      data-state={state}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        classes,
        'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {content}
    </button>
  );
}
