'use client';

import { OPTION_LABELS, cn, formatClock, formatInteger } from '@mcq/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import { Eyebrow, PAD_Y, SectionTitle, WRAP } from './layout';
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
const EASE = 'ease-[cubic-bezier(.22,1,.36,1)]';

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
  const reduced = useReducedMotion();
  const tick = useTicker(seen && !reduced, STEP_MS);

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
    <section className={cn(WRAP, PAD_Y)}>
      <div className="mb-[clamp(32px,4vw,56px)] flex flex-col items-center gap-3 text-center">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <SectionTitle>{t('title')}</SectionTitle>
        <p className="max-w-[46ch] text-pretty text-text-muted">{t('body')}</p>
      </div>
      <ol ref={ref} className="grid gap-[clamp(16px,2vw,28px)] lg:grid-cols-3">
        <Step n={1} title={t('goal.title')} body={t('goal.body')} line={drawn} lineDelay="0.4s">
          <div className="flex flex-wrap gap-2">
            {cats.map((label, i) => {
              const on = i === cat;
              return (
                <span
                  key={label}
                  className={cn(
                    'inline-flex h-[34px] items-center gap-1.5 rounded-pill border-[1.5px] px-3.5 text-[14px] transition-[background-color,color,border-color,transform] duration-[450ms]',
                    EASE,
                    on
                      ? 'scale-[1.04] border-text bg-text font-semibold text-bg'
                      : 'border-border-strong bg-surface font-normal text-text',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex overflow-hidden transition-[width] duration-[450ms]',
                      EASE,
                      on ? 'w-3.5' : 'w-0',
                    )}
                  >
                    <Check size={14} strokeWidth={3} className="flex-none" />
                  </span>
                  {label}
                </span>
              );
            })}
          </div>
          <span className="text-[13px] text-text-subtle">{captions[cat]}</span>
        </Step>

        <Step n={2} title={t('exam.title')} body={t('exam.body')} line={drawn} lineDelay="1.1s">
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <strong className="font-semibold">
              {t('question', { n: formatInteger(31 + qi, locale) })}
              <span className="font-medium text-text-subtle">
                {' '}
                {t('of', { total: formatInteger(100, locale) })}
              </span>
            </strong>
            <span className="rounded-pill border-[1.5px] border-border-strong px-2.5 py-px font-semibold">
              {formatClock(clock, locale)}
            </span>
          </div>
          <div className="h-1 rounded-[2px] bg-surface-muted">
            <div
              className={cn(
                'h-full rounded-[2px] bg-primary transition-[width] duration-600',
                EASE,
              )}
              style={{ width: `${31 + qi}%` }}
            />
          </div>
          <strong className="flex-none truncate text-[14px] leading-[1.45] font-semibold">
            {q.text}
          </strong>
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((text, k) => {
              const sel = phase >= 1 && k === mini.tap;
              const ok = phase === 2 && k === mini.answer;
              const bad = phase === 2 && sel && !ok;
              return (
                <span
                  key={`${qi}-${k}`}
                  className={cn(
                    'flex h-[34px] items-center justify-between gap-1.5 overflow-hidden rounded-[10px] border-[1.5px] px-2.5 text-[14px] whitespace-nowrap transition-[background-color,border-color] duration-[400ms]',
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
                    className={cn(
                      'text-[13px] font-bold',
                      ok ? 'text-(--brand-oki)' : 'text-(--brand-eri)',
                    )}
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
                className="grid grid-cols-[76px_minmax(0,1fr)_64px] items-center gap-2.5 text-[14px]"
              >
                <span>{subjects[i]}</span>
                <div className="h-[7px] rounded-[4px] bg-surface-muted">
                  <div
                    className={cn(
                      'h-full rounded-[4px] transition-[width,background-color] duration-[1100ms]',
                      EASE,
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
                      'justify-self-end rounded-pill px-2 text-[12px] font-semibold whitespace-nowrap transition-colors duration-[400ms]',
                      after
                        ? 'bg-success-soft text-(--brand-oki)'
                        : 'bg-danger-soft text-(--brand-eri)',
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
              'mt-1 inline-flex h-[34px] items-center gap-1.5 self-start rounded-[10px] px-3.5 text-[13px] font-semibold transition-[background-color,color,transform] duration-300',
              EASE,
              fixed ? 'bg-success text-(--brand-on-solid)' : 'bg-text text-bg',
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
            className="absolute top-[21px] left-[calc(50%+34px)] hidden h-0.5 w-[calc(100%-68px+clamp(16px,2vw,28px))] bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_6px,transparent_6px_12px)] lg:block"
          >
            <span
              className={cn(
                'absolute top-0 left-0 h-0.5 bg-primary transition-[width] duration-1000',
                EASE,
              )}
              style={{ width: line ? '100%' : '0%', transitionDelay: lineDelay }}
            />
          </span>
        )}
        <span className="relative grid size-11 flex-none place-items-center rounded-pill bg-primary font-display text-[19px] font-bold text-on-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--color-primary)_14%,transparent)]">
          {formatInteger(n, locale)}
        </span>
        <h3 className="font-display text-[length:clamp(20px,1.7vw,23px)] leading-[1.35] font-semibold">
          {title}
        </h3>
      </div>
      <div className="flex flex-1 flex-col gap-[18px] rounded-[22px] border border-border bg-surface p-[clamp(16px,1.6vw,20px)] shadow-[0_18px_36px_-28px_var(--brand-shc)] md:max-lg:flex-row md:max-lg:items-center">
        <div
          aria-hidden
          className="flex h-[200px] flex-col justify-center gap-2.5 overflow-hidden rounded-[16px] border border-border bg-bg p-[18px] md:max-lg:flex-[0_0_48%]"
        >
          {children}
        </div>
        <p className="min-w-0 flex-1 px-1 pb-1 text-center text-[16px] leading-[1.65] text-pretty text-text-muted">
          {body}
        </p>
      </div>
    </li>
  );
}
