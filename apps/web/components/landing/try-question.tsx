'use client';

import { OPTION_LABELS, cn, formatInteger } from '@mcq/ui';
import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Eyebrow, PAD_Y, SectionTitle, WRAP } from './layout';

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

  return (
    <section id="try" className="scroll-mt-20 border-y border-border bg-surface">
      <div
        className={cn(
          WRAP,
          PAD_Y,
          'grid items-start gap-[clamp(32px,5vw,80px)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <SectionTitle>{t('title')}</SectionTitle>
          <p className="max-w-[38ch] text-pretty text-text-muted">{t('body')}</p>
          <div aria-label={t('switcher')} role="group" className="mt-2 flex gap-2">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('pillLabel', { n: formatInteger(i + 1, locale) })}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
                className={cn(
                  'min-h-11 rounded-[12px] border-[1.5px] px-3.5 text-[15px] font-medium text-text',
                  i === index ? 'border-text bg-bg' : 'border-border-strong bg-transparent',
                )}
              >
                {t('pill', { n: formatInteger(i + 1, locale) })}
              </button>
            ))}
          </div>
          <Link
            href="/register"
            className="mt-12 inline-flex min-h-12 items-center gap-2 self-start rounded-[12px] bg-primary px-[22px] font-semibold text-on-primary transition-[background-color,transform] duration-[350ms] ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:bg-primary-hover"
          >
            {t('fullCta')} →
          </Link>
        </div>

        <div className="flex min-w-0 flex-col gap-[18px] rounded-[24px] border border-border bg-bg p-[clamp(18px,3vw,32px)]">
          <div className="flex flex-wrap items-center gap-2.5 text-[14px]">
            <span className="rounded-pill bg-surface-muted px-2.5 py-0.5 text-text-muted">
              {q.subject}
            </span>
            <span className="text-text-subtle">{q.topic}</span>
          </div>
          <p className="text-[length:clamp(19px,1.8vw,22px)] leading-[1.7] font-medium text-pretty">
            {q.text}
          </p>
          <div role="radiogroup" aria-label={t('answerLabel')} className="flex flex-col gap-2.5">
            {q.options.map((text, k) => {
              const ok = done && k === answer;
              const bad = done && k === picked && k !== answer;
              const tag = ok
                ? k === picked
                  ? t('yourCorrectTag')
                  : t('correctTag')
                : bad
                  ? t('yourTag')
                  : null;
              return (
                <button
                  key={`${index}-${k}`}
                  type="button"
                  role="radio"
                  aria-checked={k === picked}
                  disabled={done}
                  onClick={() => setPicked(k)}
                  className={cn(
                    'flex min-h-[60px] w-full items-center gap-3.5 rounded-[14px] border-2 py-2.5 pr-4 pl-3 text-left text-[17px] text-text transition-[background-color,border-color,opacity,transform] duration-200 active:scale-[0.985]',
                    ok
                      ? 'border-success bg-success-soft'
                      : bad
                        ? 'border-danger bg-danger-soft'
                        : 'border-border bg-surface',
                    done ? 'cursor-default' : 'cursor-pointer',
                    done && !ok && !bad && 'opacity-55',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-9 flex-none place-items-center rounded-pill border-[1.5px] font-semibold text-text-muted transition-colors duration-200',
                      ok
                        ? 'border-success bg-success text-(--brand-on-solid)'
                        : bad
                          ? 'border-danger bg-danger text-(--brand-on-solid)'
                          : 'border-border-strong bg-transparent',
                    )}
                  >
                    {ok ? (
                      <Check aria-hidden size={20} strokeWidth={2.8} />
                    ) : bad ? (
                      <X aria-hidden size={20} strokeWidth={2.8} />
                    ) : (
                      labels[k]
                    )}
                  </span>
                  <span className="min-w-0 flex-1">{text}</span>
                  {tag && (
                    <span
                      className={cn(
                        'flex-none text-[14px] font-semibold',
                        ok ? 'text-(--brand-oki)' : 'text-(--brand-eri)',
                      )}
                    >
                      {tag}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className={cn(
              'grid transition-[grid-template-rows,opacity] duration-[400ms] ease-in-out',
              done ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="min-h-0 overflow-hidden">
              {done && (
                <div className="flex flex-col gap-3.5 pt-1">
                  <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-surface px-[18px] py-4">
                    <strong
                      className={cn(
                        'flex items-center gap-2 font-semibold',
                        right ? 'text-(--brand-oki)' : 'text-(--brand-eri)',
                      )}
                    >
                      {right
                        ? t('right')
                        : t('wrong', { answer: `${labels[answer]}) ${q.options[answer]}` })}
                    </strong>
                    <p className="text-pretty text-text-muted">{q.explanation}</p>
                    <span className="text-[14px] text-text-subtle">{t('rate')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href="/register"
                      className="inline-flex min-h-12 items-center rounded-[12px] bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover"
                    >
                      {t('moreCta')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => go((index + 1) % questions.length)}
                      className="min-h-12 rounded-[12px] border-[1.5px] border-border-strong bg-transparent px-4 font-medium"
                    >
                      {t('next')}
                    </button>
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
