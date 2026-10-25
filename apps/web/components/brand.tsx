import { cn } from '@mcq/ui';

/** Placeholder app mark (docs/05 §7): rounded primary square with a check. Final icon is TBD. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-9 flex-none place-items-center rounded-md bg-primary text-on-primary',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" strokeWidth={2.5}>
        <circle cx="12" cy="12" r="8" className="stroke-current" opacity={0.45} />
        <path
          d="m8 12.5 2.7 2.7L16.5 9"
          className="stroke-current"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Brand({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className="text-h3 font-bold text-text">{name}</span>
    </span>
  );
}
