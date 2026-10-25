import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { formatClock } from '../lib/format';

export type TimerTone = 'normal' | 'warning' | 'critical';

/** Accent at 5 minutes left, live red at 1 minute (docs/05 §1.4). */
export function timerTone(remainingSec: number): TimerTone {
  if (remainingSec <= 60) return 'critical';
  if (remainingSec <= 300) return 'warning';
  return 'normal';
}

const TONE = {
  normal: { text: 'text-primary', bar: 'bg-primary' },
  warning: { text: 'text-accent-text', bar: 'bg-accent' },
  critical: { text: 'text-live', bar: 'bg-live' },
} as const;

export interface TimerBarProps {
  remainingSec: number;
  totalSec: number;
  /** Caption above the time, e.g. "বাকি সময়". */
  label: string;
  /** Locale for the digits; bn shows ০৪:৫২. */
  locale: string;
  /** Right side of the bar: answered count chip, navigator button. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Sticky exam timer with a thin progress bar. Static: the exam room drives `remainingSec` from the
 * server clock. The time is not a live region (it would announce every second).
 */
export function TimerBar({
  remainingSec,
  totalSec,
  label,
  locale,
  trailing,
  className,
}: TimerBarProps) {
  const tone = TONE[timerTone(remainingSec)];
  const fraction = totalSec > 0 ? Math.min(1, Math.max(0, remainingSec / totalSec)) : 0;
  const clock = formatClock(remainingSec, locale);

  return (
    <div
      className={cn(
        'sticky top-0 z-[var(--mcq-z-sticky)] border-b border-border bg-surface',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-2.5">
        <div>
          <div className="text-caption text-text-muted">{label}</div>
          <div
            role="timer"
            aria-label={`${label} ${clock}`}
            className={cn('text-timer font-semibold tabular-nums', tone.text)}
          >
            {clock}
          </div>
        </div>
        {trailing && <div className="flex items-center gap-2">{trailing}</div>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={totalSec}
        aria-valuenow={Math.max(0, Math.round(remainingSec))}
        className="mt-2 h-0.75 bg-surface-muted"
      >
        {/* Only the colour changes near the end; no animation in the last minute (docs/05 §6). */}
        <div className={cn('h-full', tone.bar)} style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}
