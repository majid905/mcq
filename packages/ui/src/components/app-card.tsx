import type { HTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

export interface AppCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Running exam: 4 px left edge in the live colour (docs/05 ExamCard). */
  live?: boolean;
  /** Hover style for cards that are links or buttons. */
  interactive?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function AppCard({ live, interactive, className, ref, ...props }: AppCardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-surface p-4 text-text',
        live && 'border-l-4 border-l-live',
        interactive &&
          'transition-colors duration-[var(--mcq-duration-fast)] hover:border-border-strong hover:bg-surface-muted',
        className,
      )}
      {...props}
    />
  );
}
