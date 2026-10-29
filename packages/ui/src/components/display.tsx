import { cn } from '../lib/cn';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZE = { sm: 'size-9 text-body-sm', md: 'size-12 text-h3', lg: 'size-20 text-h1' };

/** Photo, or the first letter of the name on primary-soft. */
export function Avatar({ name, src, size = 'sm', className }: AvatarProps) {
  const initial = Array.from(name.trim())[0] ?? '?';
  return (
    <span
      className={cn(
        'grid flex-none place-items-center overflow-hidden rounded-pill bg-primary-soft font-bold text-primary',
        AVATAR_SIZE[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initial}</span>
      )}
    </span>
  );
}

export interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible name, e.g. "আজকের লক্ষ্য". */
  label: string;
  tone?: 'primary' | 'accent' | 'success' | 'danger';
  className?: string;
}

export function ProgressBar({ value, max, label, tone = 'primary', className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cn('h-1.5 overflow-hidden rounded-pill bg-surface-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-pill transition-[width] duration-(--mcq-duration-slow) ease-standard',
          tone === 'accent'
            ? 'bg-accent'
            : tone === 'success'
              ? 'bg-success'
              : tone === 'danger'
                ? 'bg-danger'
                : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
