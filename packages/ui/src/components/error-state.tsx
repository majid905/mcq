import { CloudOff, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { AppButton } from './app-button';

export interface ErrorStateProps {
  /** Message for the error code (docs/04-API.md §4), already translated. */
  message: string;
  /** Button text, e.g. "আবার চেষ্টা করুন". */
  retryLabel?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Offline uses a cloud icon; everything else a warning triangle. */
  kind?: 'error' | 'offline';
  className?: string;
}

export function ErrorState({
  message,
  retryLabel,
  onRetry,
  retrying,
  kind = 'error',
  className,
}: ErrorStateProps) {
  const Icon = kind === 'offline' ? CloudOff : TriangleAlert;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center', className)}
    >
      <span className="grid size-12 place-items-center rounded-pill bg-danger-soft text-danger">
        <Icon aria-hidden size={24} strokeWidth={1.75} />
      </span>
      <p className="max-w-80 text-body text-text">{message}</p>
      {onRetry && retryLabel && (
        <AppButton variant="secondary" size="sm" loading={retrying} onClick={onRetry}>
          {retryLabel}
        </AppButton>
      )}
    </div>
  );
}
