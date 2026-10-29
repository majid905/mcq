'use client';

import { OPTION_LABELS, cn, formatClock, formatInteger } from '@mcq/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import { useInView, useReducedMotion, useTicker } from './motion';

/** Right option and the simulated tap for each mini question in `landing.how.questions`. */
const MINI = [
  { answer: 2, tap: 2 },
  { answer: 1, tap: 0 },
  { answer: 1, tap: 1 },
];
/** Subject bars in step 3: score %, and the score after practice for the weak one. */
const BARS = [
  { value: 83, tone: 'bg-primary' },
  { value: 60, tone: 'bg-accent' },
  { value: 42, after: 76, tone: 'bg-danger' },
];
const STEP_MS = 1400;

/**
 * Three step cards, each with a looping mini animation (no hover effects). Loops run only while
 * the section is on screen and never with reduced motion (first state shown instead).
 */
export function HowItWorks() {
  const t = useTranslations('landing.how');
  const locale = useLocale();
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const ref = useRef<HTMLOListElement>(null);
  const seen = useInView(ref, { threshold: 0.3, once: true });
  const onScreen = useInView(ref, { threshold: 0 });
  const reduced = useReducedMotion();
  const tick = useTicker(seen && onScreen && !reduced, STEP_MS);

  const cats = t.raw('cats') as string[];
  const captions = t.raw('captions') as string[];
  const questions = t.raw('questions') as { text: string; options: string[] }[];
  const subjects = t.raw('subjects') as string[];

  const round = Math.floor(tick / 3);
  const phase = tick % 3;
  const cat = round % cats.length;
  const qi = round % questions.length;
  const q = questions[qi]!;
  const mini = MINI[qi]!;
  const fixed = round % 2 === 1;
  const clock = Math.max(0, Math.floor(2538 - tick * 1.4));
  const drawn = seen || reduced;

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-14 md:px-8 md:py-20 lg:py-28 xl:px-14">
      <div className="mb-8 flex flex-col items-center gap-3 text-center md:mb-14">
        <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
        <h2 className="font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
          {t('title')}
        </h2>
        <p className="max-w-[46ch] text-body text-text-muted">{t('body')}</p>
      </div>
      <ol ref={ref} className="grid gap-4 lg:grid-cols-3 lg:gap-7">
        <Step n={1} title={t('goal.title')} body={t('goal.body')} line={drawn} lineDelay="0.4s">
          <div className="flex flex-wrap gap-2">
            {cats.map((label, i) => {
              const on = i === cat;
              return (
                <span
                  key={label}
                  className={cn(
                    'inline-flex h-8.5 items-center rounded-pill border-[1.5px] px-3.5 text-body-sm transition-[background-color,color,border-color,transform] duration-(--mcq-duration-slow) ease-standard',
                    on
                      ? 'scale-104 border-text bg-text font-semibold text-bg'
                      : 'border-border-strong bg-surface text-text',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex overflow-hidden transition-[width] duration-(--mcq-duration-slow)',
                      on ? 'mr-1.5 w-3.5' : 'w-0',
                    )}
                  >
                    <Check size={14} strokeWidth={3} className="flex-none" />
                  </span>
                  {label}
                </span>
              );
            })}
          </div>
          <span key={cat} className="landing-in text-caption text-text-subtle">
            {captions[cat]}
          </span>
        </Step>

        <Step n={2} title={t('exam.title')} body={t('exam.body')} line={drawn} lineDelay="1.1s">
          <div className="flex items-center justify-between gap-2 text-caption">
            <strong className="font-semibold text-text">
              {t('question', { n: formatInteger(31 + qi, locale) })}
              <span className="font-medium text-text-subtle">
                {' '}
                {t('of', { total: formatInteger(100, locale) })}
              </span>
            </strong>
            <span className="rounded-pill border-[1.5px] border-border-strong px-2.5 font-semibold tabular-nums">
              {formatClock(clock, locale)}
            </span>
          </div>
          <div className="h-1 rounded-pill bg-surface-muted">
            <div
              className="h-full rounded-pill bg-primary transition-[width] duration-(--mcq-duration-slow)"
              style={{ width: `${31 + qi}%` }}
            />
          </div>
          <strong className="truncate text-body-sm font-semibold text-text">{q.text}</strong>
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((text, k) => {
              const sel = phase >= 1 && k === mini.tap;
              const ok = phase === 2 && k === mini.answer;
              const bad = phase === 2 && sel && !ok;
              return (
                <span
                  key={`${qi}-${k}`}
                  className={cn(
                    'flex h-8.5 items-center justify-between gap-1.5 overflow-hidden rounded-md border-[1.5px] px-2.5 text-body-sm whitespace-nowrap transition-colors duration-(--mcq-duration-slow)',
                    ok
                      ? 'border-success bg-success-soft font-semibold'
                      : bad
                        ? 'border-danger bg-danger-soft'
                        : sel
                          ? 'border-primary bg-primary-soft font-semibold'
                          : 'border-border bg-surface',
                  )}
                >
                  <span className="truncate">
                    {labels[k]}) {text}
                  </span>
                  <span
                    className={cn('text-caption font-bold', ok ? 'text-success' : 'text-danger')}
                  >
                    {ok ? '✓' : bad ? '✕' : ''}
                  </span>
                </span>
              );
            })}
          </div>
        </Step>

        <Step n={3} title={t('fix.title')} body={t('fix.body')}>
          {BARS.map((bar, i) => {
            const after = fixed && bar.after !== undefined;
            const weak = bar.after !== undefined;
            return (
              <div
                key={subjects[i]}
                className="grid grid-cols-[4.75rem_minmax(0,1fr)_4rem] items-center gap-2.5 text-body-sm"
              >
                <span>{subjects[i]}</span>
                <div className="h-1.75 rounded-pill bg-surface-muted">
                  <div
                    className={cn(
                      'h-full rounded-pill transition-[width,background-color] duration-1000 ease-standard',
                      after ? 'bg-primary' : bar.tone,
                    )}
                    style={{
                      width: drawn ? `${after ? bar.after : bar.value}%` : '0%',
                      transitionDelay: tick === 0 ? `${0.2 + i * 0.15}s` : '0s',
                    }}
                  />
                </div>
                {weak ? (
                  <span
                    className={cn(
                      'justify-self-end rounded-pill px-2 text-caption font-semibold whitespace-nowrap transition-colors duration-(--mcq-duration-slow)',
                      after ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
                    )}
                  >
                    {after ? t('improved') : t('weak')}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <span
            className={cn(
              'mt-1 inline-flex h-8.5 items-center self-start rounded-md px-3.5 text-caption font-semibold transition-[background-color,color,transform] duration-(--mcq-duration-slow) ease-standard',
              fixed ? 'bg-success text-on-primary' : 'bg-text text-bg',
              !fixed && phase === 2 && 'scale-95',
            )}
          >
            {fixed ? t('done') : t('practice')}
          </span>
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  line,
  lineDelay,
  children,
}: {
  n: number;
  title: string;
  body: string;
  /** Draws the dashed connector to the next step (desktop only). */
  line?: boolean;
  lineDelay?: string;
  children: ReactNode;
}) {
  const locale = useLocale();
  return (
    <li className="flex min-w-0 flex-col gap-4">
      <div className="relative flex flex-col items-center gap-2.5 text-center">
        {lineDelay !== undefined && (
          <span
            aria-hidden
            className="absolute top-5 left-[calc(50%+2.125rem)] hidden h-0.5 w-[calc(100%-4.25rem+1.75rem)] bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_6px,transparent_6px_12px)] lg:block"
          >
            <span
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-1000 ease-standard"
              style={{ width: line ? '100%' : '0%', transitionDelay: lineDelay }}
            />
          </span>
        )}
        <span className="relative grid size-11 flex-none place-items-center rounded-pill bg-primary font-display text-h3 font-bold text-on-primary ring-6 ring-primary/15">
          {formatInteger(n, locale)}
        </span>
        <h3 className="font-display text-h2 font-semibold text-text">{title}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-4.5 rounded-xl border border-border bg-surface p-4 shadow-md md:max-lg:flex-row md:max-lg:items-center lg:p-5">
        <div
          aria-hidden
          className="flex h-50 flex-col justify-center gap-2.5 overflow-hidden rounded-lg border border-border bg-bg p-4.5 md:max-lg:flex-[0_0_48%]"
        >
          {children}
        </div>
        <p className="min-w-0 flex-1 px-1 pb-1 text-center text-body text-pretty text-text-muted">
          {body}
        </p>
      </div>
    </li>
  );
}
