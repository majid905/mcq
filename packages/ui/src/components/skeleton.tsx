import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Placeholder block. Compose several to match the final layout; lists use skeletons, not spinners
 * (docs/05 Skeleton). Hidden from screen readers; put `aria-busy` on the region that is loading.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('rounded-sm bg-surface-sunken motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}
