'use client';

import { Crown, Lock, Trophy } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '../lib/cn';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const id = setTimeout(() => setReduced(mq.matches), 0);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => {
      clearTimeout(id);
      mq.removeEventListener('change', on);
    };
  }, []);
  return reduced;
}

/** Counts from 0 to `value` over `ms` (no animation with reduced motion). */
export function useCountUp(value: number, ms = 800): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) {
      const id = setTimeout(() => setShown(value), 0);
      return () => clearTimeout(id);
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);
  return shown;
}

export interface ScoreRingProps {
  score: number;
  total: number;
  /** Centre text, already formatted (e.g. "৭৮.৫"). Receives the animated value. */
  format: (value: number) => string;
  /** Under the score, e.g. "/১০০". */
  caption: string;
  /** Accessible summary, e.g. "স্কোর ৭৮.৫, মোট ১০০". */
  label: string;
  size?: number;
  className?: string;
}

/** docs/05 ScoreRing: 140 px ring, animates 0 → score over 800 ms (reduced-motion aware). */
export function ScoreRing({
  score,
  total,
  format,
  caption,
  label,
  size = 140,
  className,
}: ScoreRingProps) {
  const shown = useCountUp(score);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, shown / total)) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="stroke-primary"
        />
      </svg>
      <div aria-hidden className="absolute text-center">
        <div className="text-stat font-bold tabular-nums text-text">{format(shown)}</div>
        <div className="text-caption text-text-muted">{caption}</div>
      </div>
    </div>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Status icon + colour, never colour alone (docs/05 §1). */
  tone?: 'default' | 'success' | 'danger' | 'muted';
  icon?: ReactNode;
  className?: string;
}

const TONE = {
  default: 'text-text',
  success: 'text-success',
  danger: 'text-danger',
  muted: 'text-text-muted',
};

export function StatTile({ label, value, tone = 'default', icon, className }: StatTileProps) {
  return (
    <div className={cn('rounded-md border border-border bg-surface p-3 text-center', className)}>
      <div
        className={cn(
          'flex items-center justify-center gap-1 text-timer font-semibold tabular-nums',
          TONE[tone],
        )}
      >
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-caption text-text-muted">{label}</div>
    </div>
  );
}

export function RankBadge({
  title,
  detail,
  className,
}: {
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg bg-accent-soft px-4 py-3', className)}>
      <span className="grid size-10 flex-none place-items-center rounded-md bg-accent text-on-accent">
        <Trophy aria-hidden size={20} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-text">{title}</p>
        {detail && <p className="text-body-sm text-text-muted">{detail}</p>}
      </div>
    </div>
  );
}

/** docs/05 PremiumLock: blurred content + crown + CTA. */
export function PremiumLock({
  title,
  cta,
  children,
  className,
}: {
  title: string;
  /** Usually an AppButton linking to /plans. */
  cta: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
    >
      {children && (
        <div aria-hidden className="pointer-events-none select-none p-4 blur-sm">
          {children}
        </div>
      )}
      <div
        className={cn(
          'flex flex-col items-center gap-3 p-6 text-center',
          children && 'absolute inset-0 justify-center bg-surface/70',
        )}
      >
        <span className="grid size-12 place-items-center rounded-pill bg-accent text-on-accent">
          {children ? <Crown aria-hidden size={22} /> : <Lock aria-hidden size={22} />}
        </span>
        <p className="max-w-80 text-body font-semibold text-text">{title}</p>
        {cta}
      </div>
    </div>
  );
}
