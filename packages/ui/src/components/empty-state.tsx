import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Default 120 px two-colour line illustration (primary + accent): an empty answer sheet. */
function EmptyIllustration() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="size-30"
      fill="none"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="28" y="18" width="64" height="84" rx="10" className="stroke-primary" />
      <path d="M44 42h32M44 58h32M44 74h18" className="stroke-primary" opacity={0.45} />
      <circle cx="86" cy="86" r="14" className="fill-accent-soft stroke-accent" />
      <path d="M81 86h10" className="stroke-accent" />
    </svg>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Optional call to action, usually an AppButton. */
  action?: ReactNode;
  illustration?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  illustration,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}>
      {illustration ?? <EmptyIllustration />}
      <h3 className="text-h3 font-semibold text-text">{title}</h3>
      {description && <p className="max-w-80 text-body-sm text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
