import { cn } from '@mcq/ui';

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

/** Five filled amber stars (decorative). */
export function Stars({ className }: { className?: string }) {
  return (
    <span aria-hidden className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={cn('fill-accent', className)}>
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}
