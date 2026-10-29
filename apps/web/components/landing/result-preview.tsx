'use client';

import { Avatar, ProgressBar, ScoreRing, cn, formatDecimal, formatInteger } from '@mcq/ui';
import { Check, Minus, Pointer, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
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

/** Numbers for the sample results in `landing.result.samples` (illustration only). */
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

const barTone = (r: number) => (r < 0.55 ? 'danger' : r < 0.7 ? 'accent' : 'primary');

/**
 * Sample result card that cross-fades between a few results while on screen. Topic capsules show
 * their insight on hover or focus; rotation pauses while one is open.
 */
export function ResultPreview() {
  const t = useTranslations('landing.result');
  const locale = useLocale();
  const samples = t.raw('samples') as Sample[];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.35 });
  const seen = useInView(ref, { threshold: 0.35, once: true });
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<string | null>(null);
  const [tipRight, setTipRight] = useState(false);
  const openTip = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const width = Math.min(250, window.innerWidth - 48);
    setTipRight(r.left + width > window.innerWidth - 16 && r.right - width >= 16);
    setTip(id);
  };
  const tick = useTicker(inView && !reduced && tip === null, ROTATE_MS);
  const current = tick % samples.length;
  const d = (v: number) => formatDecimal(v, locale);

  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto grid max-w-(--breakpoint-xl) items-center gap-8 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-28 xl:px-14">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
          <h2 className="font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
            {t('title')}
          </h2>
          <p className="max-w-[40ch] text-body text-text-muted">{t('body')}</p>
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
          className="min-w-0 rounded-xl border border-border bg-bg p-4.5 shadow-lg md:p-8"
        >
          <div className="grid">
            {samples.map((s, si) => {
              const num = NUMBERS[si]!;
              const on = si === current;
              const score = num.correct - num.wrong * 0.5;
              const capsule = (kind: 'strong' | 'weak', item: Insight, k: number) => {
                const id = `${si}-${kind}-${k}`;
                const pct = num[kind][k]!;
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
                      'relative inline-flex min-h-10 cursor-help items-center gap-2 rounded-pill border-[1.5px] px-3.5 text-body font-medium transition-colors duration-(--mcq-duration-fast)',
                      strong
                        ? 'border-success/50 bg-success-soft hover:border-success'
                        : 'border-danger/50 bg-danger-soft hover:border-danger',
                    )}
                  >
                    {item.topic}
                    <strong className={cn('font-bold', strong ? 'text-success' : 'text-danger')}>
                      {strong ? '↑' : '↓'} {formatInteger(pct, locale)}%
                    </strong>
                    {open && (
                      <span
                        id={`tip-${id}`}
                        role="tooltip"
                        className={cn(
                          'landing-tip pointer-events-none absolute bottom-[calc(100%+0.75rem)] z-10 w-[min(15.625rem,calc(100vw-3rem))] rounded-lg bg-text px-3.5 py-3 text-left text-caption leading-relaxed font-normal text-bg shadow-lg',
                          tipRight ? 'right-0' : 'left-0',
                        )}
                      >
                        <strong className="mb-0.5 block text-body-sm font-semibold">
                          {item.topic} · {formatInteger(pct, locale)}%
                        </strong>
                        {item.note}
                        <span
                          className={cn(
                            'absolute -bottom-1.25 size-2.5 rotate-45 bg-text',
                            tipRight ? 'right-5.5' : 'left-5.5',
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
                    'flex min-w-0 flex-col gap-5 transition-opacity duration-900 ease-standard [grid-area:1/1]',
                    on ? 'z-1 opacity-100' : 'pointer-events-none opacity-0',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size="sm" className="size-10 text-body" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="font-semibold text-text">{s.name}</strong>
                      <span className="truncate text-body-sm text-text-subtle">{s.test}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 md:gap-7">
                    <ScoreRing
                      score={seen || reduced ? score : 0}
                      total={100}
                      size={132}
                      format={d}
                      caption={t('outOf', { total: formatInteger(100, locale) })}
                      label={t('scoreLabel', {
                        score: d(score),
                        total: formatInteger(100, locale),
                      })}
                      className="flex-none"
                    />
                    <div className="grid min-w-50 flex-1 grid-cols-2 gap-2.5">
                      <Tile
                        className="bg-success-soft"
                        labelClass="text-success"
                        icon={<Check size={15} strokeWidth={2.6} />}
                        label={t('correct')}
                      >
                        {formatInteger(num.correct, locale)}
                      </Tile>
                      <Tile
                        className="bg-danger-soft"
                        labelClass="text-danger"
                        icon={<X size={15} strokeWidth={2.6} />}
                        label={t('wrong')}
                      >
                        {formatInteger(num.wrong, locale)}{' '}
                        <span className="text-body-sm font-medium text-danger">
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
                        <span className="text-body-sm font-medium">
                          {t('rankOf', { total: d(num.of) })}
                        </span>
                      </Tile>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-body font-semibold">{t('subjects')}</h3>
                    {s.subjects.map((name, k) => {
                      const v = num.subjects[k]!;
                      return (
                        <div
                          key={name}
                          className="grid grid-cols-[minmax(0,9.5em)_minmax(0,1fr)_4.2em] items-center gap-3 text-body"
                        >
                          <span className="truncate">{name}</span>
                          <ProgressBar
                            value={seen || reduced ? v : 0}
                            max={SUBJECT_MAX}
                            label={name}
                            tone={barTone(v / SUBJECT_MAX)}
                            className="h-2"
                          />
                          <span className="text-right font-semibold tabular-nums">
                            {d(v)}/{formatInteger(SUBJECT_MAX, locale)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2.5 border-t border-border pt-4.5">
                    <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-body font-semibold">
                      {t('topics')}
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft py-0.75 pr-2.5 pl-2 text-caption font-semibold text-accent-text">
                        <Pointer aria-hidden size={14} strokeWidth={2.2} />
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
    <div className={cn('rounded-md px-3 py-2.5', className)}>
      <div className={cn('flex items-center gap-1.5 text-body-sm', labelClass)}>
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </div>
      <div className="font-display text-h2 font-semibold text-text">{children}</div>
    </div>
  );
}
