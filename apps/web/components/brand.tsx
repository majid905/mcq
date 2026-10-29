import { cn } from '@mcq/ui';

const SIZES = {
  /** Exam header. */
  sm: 'text-h3',
  /** Site and app headers. */
  md: 'text-h2',
  /** Footer. */
  lg: 'text-stat',
} as const;

/**
 * Logo 1d "যাত্রাপথ" (design/landing/README.md): the wordmark in Anek Bangla over a path of a dot,
 * a dashed line and an amber check. Built from type and shapes until the vector logo exists; every
 * part is sized in em so it scales with the wordmark.
 */
export function Brand({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-col gap-[0.14em]', SIZES[size], className)}>
      <span className="font-display font-bold leading-none text-text [font-stretch:110%]">
        {name}
      </span>
      <span aria-hidden className="flex items-center gap-[0.14em]">
        <span className="size-[0.24em] flex-none rounded-pill bg-primary" />
        <span className="h-0.5 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-primary)_0_5px,transparent_5px_9px)]" />
        <span className="grid size-[0.42em] flex-none place-items-center rounded-pill bg-accent text-on-accent">
          <svg
            viewBox="0 0 24 24"
            className="size-[70%]"
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </span>
    </span>
  );
}
