'use client';

import {
  AppButton,
  OPTION_LABELS,
  OptionTile,
  type OptionTileState,
  cn,
  formatInteger,
} from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';

interface TryQuestion {
  subject: string;
  topic: string;
  text: string;
  options: string[];
  explanation: string;
}

/** Index of the right option for each sample question in messages `landing.try.questions`. */
const ANSWERS = [2, 1, 2];

/** "Try one question" (#try): pick an option, see right/wrong and the explanation. Local only. */
export function TryQuestion() {
  const t = useTranslations('landing.try');
  const locale = useLocale();
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const questions = t.raw('questions') as TryQuestion[];
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const q = questions[index]!;
  const answer = ANSWERS[index]!;
  const done = picked !== null;
  const right = picked === answer;
  const go = (i: number) => {
    setIndex(i);
    setPicked(null);
  };

  const stateOf = (k: number): OptionTileState =>
    !done ? 'idle' : k === answer ? 'correct' : k === picked ? 'wrong' : 'idle';
  const tagOf = (k: number) =>
    !done
      ? null
      : k === answer
        ? k === picked
          ? t('yourCorrectTag')
          : t('correctTag')
        : k === picked
          ? t('yourTag')
          : null;

  return (
    <section id="try" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto grid max-w-(--breakpoint-xl) items-start gap-8 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28 xl:px-14">
        <div className="flex min-w-0 flex-col gap-4">
          <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
          <h2 className="font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
            {t('title')}
          </h2>
          <p className="max-w-[38ch] text-body text-text-muted">{t('body')}</p>
          <div role="group" aria-label={t('switcher')} className="mt-2 flex gap-2">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('pillLabel', { n: formatInteger(i + 1, locale) })}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
                className={cn(
                  'min-h-11 rounded-md border-[1.5px] px-3.5 font-medium text-text transition-colors duration-(--mcq-duration-fast)',
                  i === index ? 'border-text bg-bg' : 'border-border-strong hover:bg-surface-muted',
                )}
              >
                {t('pill', { n: formatInteger(i + 1, locale) })}
              </button>
            ))}
          </div>
          <AppButton
            asChild
            className="mt-6 h-12 self-start transition-[background-color,transform] duration-(--mcq-duration-slow) motion-safe:hover:-translate-y-0.5 lg:mt-12"
          >
            <Link href="/register">{t('fullCta')} →</Link>
          </AppButton>
        </div>

        <div className="flex min-w-0 flex-col gap-4.5 rounded-xl border border-border bg-bg p-4.5 md:p-8">
          <div className="flex flex-wrap items-center gap-2.5 text-body-sm">
            <span className="rounded-pill bg-surface-muted px-2.5 py-0.5 text-text-muted">
              {q.subject}
            </span>
            <span className="text-text-subtle">{q.topic}</span>
          </div>
          <p className="text-h3 font-medium text-pretty text-text md:text-h2 md:leading-relaxed">
            {q.text}
          </p>
          <div role="radiogroup" aria-label={t('answerLabel')} className="flex flex-col gap-2.5">
            {q.options.map((text, k) => {
              const tag = tagOf(k);
              const state = stateOf(k);
              return (
                <OptionTile
                  key={`${index}-${k}`}
                  label={labels[k]!}
                  state={state}
                  onSelect={done ? undefined : () => setPicked(k)}
                  statusLabel={tag ?? undefined}
                  className={cn('min-h-15', done && state === 'idle' && 'opacity-55')}
                >
                  <span className="flex flex-wrap items-center justify-between gap-x-3">
                    <span>{text}</span>
                    {tag && (
                      <span
                        aria-hidden
                        className={cn(
                          'text-body-sm font-semibold',
                          state === 'correct' ? 'text-success' : 'text-danger',
                        )}
                      >
                        {tag}
                      </span>
                    )}
                  </span>
                </OptionTile>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-(--mcq-duration-slow) ease-standard',
              done ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="min-h-0 overflow-hidden">
              {done && (
                <div className="flex flex-col gap-3.5 pt-1">
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4.5 py-4">
                    <strong className={cn('font-semibold', right ? 'text-success' : 'text-danger')}>
                      {right
                        ? t('right')
                        : t('wrong', { answer: `${labels[answer]}) ${q.options[answer]}` })}
                    </strong>
                    <p className="text-body text-pretty text-text-muted">{q.explanation}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <AppButton asChild className="h-12">
                      <Link href="/register">{t('moreCta')}</Link>
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      className="h-12"
                      onClick={() => go((index + 1) % questions.length)}
                    >
                      {t('next')}
                    </AppButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
