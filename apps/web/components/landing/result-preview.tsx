'use client';

import { cn, formatDecimal, formatInteger } from '@mcq/ui';
import { Check, Minus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import { Eyebrow, PAD_Y, SectionTitle, WRAP } from './layout';
import { useInView, useReducedMotion, useTicker } from './motion';

interface Insight {
  topic: string;
  note: string;
}
interface Sample {
  name: string;
  test: string;
  subjects: string[];
  strong: Insight[];
  weak: Insight[];
}

/** Numbers for the sample results in `landing.result.samples` (from the design). */
const NUMBERS = [
  {
    correct: 78,
    wrong: 11,
    rank: 87,
    of: 1240,
    subjects: [17.5, 12, 18, 9, 16],
    strong: [95, 90],
    weak: [38, 45, 52],
  },
  {
    correct: 84,
    wrong: 8,
    rank: 23,
    of: 860,
    subjects: [16, 12, 19, 14, 19],
    strong: [96, 92, 88],
    weak: [45, 48],
  },
  {
    correct: 58,
    wrong: 22,
    rank: 412,
    of: 980,
    subjects: [15, 8, 7, 9, 8],
    strong: [82],
    weak: [28, 35, 41],
  },
];
const SUBJECT_MAX = 20;
const ROTATE_MS = 6500;
const RING = 326.7; // 2π × 52

const tone = (r: number) => (r < 0.55 ? 'danger' : r < 0.7 ? 'accent' : 'primary');
const BAR = { danger: 'bg-danger', accent: 'bg-accent', primary: 'bg-primary' };
const STROKE = { danger: 'stroke-danger', accent: 'stroke-accent', primary: 'stroke-primary' };

/**
 * Sample result card that cross-fades between a few results while on screen. Topic capsules show
 * their insight on hover or focus; rotation pauses while one is open.
 */
export function ResultPreview() {
  const t = useTranslations('landing.result');
  const locale = useLocale();
  const samples = t.raw('samples') as Sample[];
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { threshold: 0.35, once: true });
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<string | null>(null);
  const [tipRight, setTipRight] = useState(false);
  const tick = useTicker(seen && !reduced && tip === null, ROTATE_MS);
  const current = tick % samples.length;
  const drawn = seen || reduced;
  const d = (v: number) => formatDecimal(v, locale);
  const openTip = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = Math.min(250, window.innerWidth - 48);
    setTipRight(r.left + width > window.innerWidth - 16 && r.right - width >= 16);
    setTip(id);
  };

  return (
    <section className="border-y border-border bg-surface">
      <div
        className={cn(
          WRAP,
          PAD_Y,
          'grid items-center gap-[clamp(32px,5vw,80px)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <SectionTitle>{t('title')}</SectionTitle>
          <p className="max-w-[40ch] text-pretty text-text-muted">{t('body')}</p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {(t.raw('points') as string[]).map((p) => (
              <li key={p} className="flex gap-2.5">
                <Check
                  aria-hidden
                  size={20}
                  strokeWidth={2.4}
                  className="mt-1 flex-none text-primary"
                />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div
          ref={ref}
          className="min-w-0 rounded-[24px] border border-border bg-bg p-[clamp(18px,2.6vw,32px)] shadow-[0_40px_80px_-48px_rgb(21_23_28/0.35)]"
        >
          <div className="grid">
            {samples.map((s, si) => {
              const num = NUMBERS[si]!;
              const on = si === current;
              const score = num.correct - num.wrong * 0.5;
              const ring = tone(score >= 70 ? 1 : score >= 55 ? 0.6 : 0);
              const capsule = (kind: 'strong' | 'weak', item: Insight, k: number) => {
                const id = `${si}-${kind}-${k}`;
                const pct = formatInteger(num[kind][k]!, locale);
                const open = on && tip === id;
                const strong = kind === 'strong';
                return (
                  <span
                    key={id}
                    tabIndex={on ? 0 : -1}
                    aria-describedby={open ? `tip-${id}` : undefined}
                    onMouseEnter={(e) => openTip(id, e.currentTarget)}
                    onMouseLeave={() => setTip((v) => (v === id ? null : v))}
                    onFocus={(e) => openTip(id, e.currentTarget)}
                    onBlur={() => setTip((v) => (v === id ? null : v))}
                    className={cn(
                      'relative inline-flex min-h-10 cursor-help items-center gap-2 rounded-pill border-[1.5px] px-3.5 text-[15px] font-medium transition-[transform,box-shadow] duration-[350ms] ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:shadow-[0_4px_10px_-6px_rgb(0_0_0/0.12)]',
                      strong
                        ? 'border-[color-mix(in_oklab,var(--color-success)_50%,transparent)] bg-success-soft'
                        : 'border-[color-mix(in_oklab,var(--color-danger)_50%,transparent)] bg-danger-soft',
                    )}
                  >
                    {item.topic}
                    <strong
                      className={cn(
                        'font-bold',
                        strong ? 'text-(--brand-oki)' : 'text-(--brand-eri)',
                      )}
                    >
                      {strong ? '↑' : '↓'} {pct}%
                    </strong>
                    {open && (
                      <span
                        id={`tip-${id}`}
                        role="tooltip"
                        className={cn(
                          'landing-tip pointer-events-none absolute bottom-[calc(100%+12px)] z-10 w-[min(250px,calc(100vw-48px))] rounded-[14px] bg-text px-3.5 py-3 text-left text-[13px] leading-[1.55] font-normal text-bg shadow-[0_18px_36px_-14px_rgb(0_0_0/0.45)]',
                          tipRight ? 'right-0' : 'left-0',
                        )}
                      >
                        <strong className="mb-0.5 block text-[14px] font-semibold">
                          {item.topic} · {pct}%
                        </strong>
                        {item.note}
                        <span
                          className={cn(
                            'absolute -bottom-[5px] size-2.5 rotate-45 bg-text',
                            tipRight ? 'right-[22px]' : 'left-[22px]',
                          )}
                        />
                      </span>
                    )}
                  </span>
                );
              };

              return (
                <div
                  key={s.name}
                  aria-hidden={on ? undefined : true}
                  className={cn(
                    'flex min-w-0 flex-col gap-5 transition-opacity duration-900 ease-[cubic-bezier(.4,0,.2,1)] [grid-area:1/1]',
                    on ? 'z-1 opacity-100' : 'pointer-events-none z-0 opacity-0',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 flex-none place-items-center rounded-pill bg-primary-soft text-[16px] font-semibold text-(--brand-pri)">
                      {Array.from(s.name)[0]}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
                      <strong className="text-[16px] font-semibold">{s.name}</strong>
                      <span className="truncate text-[14px] text-text-subtle">{s.test}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-[clamp(16px,2.4vw,28px)]">
                    <div
                      role="img"
                      aria-label={t('scoreLabel', {
                        score: d(score),
                        total: formatInteger(100, locale),
                      })}
                      className="relative size-[132px] flex-none"
                    >
                      <svg viewBox="0 0 120 120" className="size-[132px] -rotate-90">
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          strokeWidth={12}
                          className="stroke-surface-muted"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r="52"
                          fill="none"
                          strokeWidth={12}
                          strokeLinecap="round"
                          strokeDasharray={RING}
                          strokeDashoffset={drawn ? RING * (1 - score / 100) : RING}
                          className={cn(
                            'transition-[stroke-dashoffset] duration-[1200ms] ease-[cubic-bezier(.2,.7,.2,1)]',
                            STROKE[ring],
                          )}
                        />
                      </svg>
                      <div
                        aria-hidden
                        className="absolute inset-0 grid place-items-center text-center"
                      >
                        <div>
                          <div className="font-display text-[30px] leading-[1.1] font-semibold">
                            {d(score)}
                          </div>
                          <div className="text-[13px] text-text-subtle">
                            {t('outOf', { total: formatInteger(100, locale) })}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="grid min-w-[200px] flex-1 grid-cols-2 gap-2.5">
                      <Tile
                        className="bg-success-soft"
                        labelClass="text-(--brand-oki)"
                        icon={<Check size={15} strokeWidth={2.6} />}
                        label={t('correct')}
                      >
                        {formatInteger(num.correct, locale)}
                      </Tile>
                      <Tile
                        className="bg-danger-soft"
                        labelClass="text-(--brand-eri)"
                        icon={<X size={15} strokeWidth={2.6} />}
                        label={t('wrong')}
                      >
                        {formatInteger(num.wrong, locale)}{' '}
                        <span className="text-[14px] font-medium text-(--brand-eri)">
                          (−{d(num.wrong * 0.5)})
                        </span>
                      </Tile>
                      <Tile
                        className="bg-surface-muted"
                        labelClass="text-text-muted"
                        icon={<Minus size={15} strokeWidth={2.6} />}
                        label={t('skipped')}
                      >
                        {formatInteger(100 - num.correct - num.wrong, locale)}
                      </Tile>
                      <Tile
                        className="bg-accent-soft"
                        labelClass="text-accent-text"
                        label={t('rank')}
                      >
                        {formatInteger(num.rank, locale)}
                        <span className="text-[14px] font-medium">
                          {t('rankOf', { total: d(num.of) })}
                        </span>
                      </Tile>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[16px] font-semibold">{t('subjects')}</h3>
                    {s.subjects.map((name, k) => {
                      const v = num.subjects[k]!;
                      return (
                        <div
                          key={name}
                          className="grid grid-cols-[minmax(0,9.5em)_minmax(0,1fr)_4.2em] items-center gap-3 text-[15px]"
                        >
                          <span className="truncate">{name}</span>
                          <div className="h-2 rounded-[4px] bg-surface-muted">
                            <div
                              className={cn(
                                'h-full rounded-[4px] transition-[width] duration-1000 ease-[cubic-bezier(.2,.7,.2,1)]',
                                BAR[tone(v / SUBJECT_MAX)],
                              )}
                              style={{
                                width: drawn ? `${Math.round((v / SUBJECT_MAX) * 100)}%` : '0%',
                              }}
                            />
                          </div>
                          <span className="text-right font-semibold">
                            {d(v)}/{formatInteger(SUBJECT_MAX, locale)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 border-t border-border pt-[18px]">
                    <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[16px] font-semibold">
                      {t('topics')}
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft py-[3px] pr-2.5 pl-2 text-[13px] font-semibold text-accent-text">
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden
                          className="size-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.6L4.2 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5" />
                        </svg>
                        {t('hint')}
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {s.strong.map((item, k) => capsule('strong', item, k))}
                      {s.weak.map((item, k) => capsule('weak', item, k))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile({
  className,
  labelClass,
  icon,
  label,
  children,
}: {
  className: string;
  labelClass: string;
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-[12px] px-3 py-2.5', className)}>
      <div className={cn('flex items-center gap-1.5 text-[14px]', labelClass)}>
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="font-display text-[22px] leading-[1.3] font-semibold">{children}</div>
    </div>
  );
}
