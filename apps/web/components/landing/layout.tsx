import { cn } from '@mcq/ui';
import type { ReactNode } from 'react';

/** Prototype layout: max-width 1280, side padding clamp(16px, 4vw, 56px). */
export const WRAP = 'mx-auto w-full max-w-(--breakpoint-xl) px-[clamp(16px,4vw,56px)]';
/** Section vertical padding clamp(56px, 8vw, 112px). */
export const PAD_Y = 'py-[clamp(56px,8vw,112px)]';
export const PAD_T = 'pt-[clamp(56px,8vw,112px)]';
export const PAD_B = 'pb-[clamp(56px,8vw,112px)]';

/** Small label above a section title (15px, 600, primary ink). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-[15px] font-semibold text-(--brand-pri)">{children}</span>;
}

/** Section H2: display face, clamp(30px, 3.6vw, 50px), line height 1.3. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        'font-display text-[length:clamp(30px,3.6vw,50px)] leading-[1.3] font-semibold text-balance text-text',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** Centered eyebrow + title (+ subline) block used by most sections. */
export function SectionHead({
  eyebrow,
  title,
  sub,
  titleClass,
  subClass,
  className,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  titleClass?: string;
  subClass?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <SectionTitle className={titleClass}>{title}</SectionTitle>
      {sub && <p className={cn('text-pretty text-text-muted', subClass)}>{sub}</p>}
    </div>
  );
}
