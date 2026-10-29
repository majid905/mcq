import { cn, formatDecimal, formatInteger } from '@mcq/ui';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PAD_B, SectionHead, WRAP } from './layout';
import { OmrSheet } from './omr-sheet';

/** Illustration numbers for the sample result tiles (from the design). */
const SAMPLE = { correct: 79, wrong: 13, skipped: 8, rank: 87, of: 1240, topPct: 7 };
const WEAK = [
  { pct: 38, bar: 'bg-danger', text: 'text-(--brand-eri)' },
  { pct: 52, bar: 'bg-accent', text: 'text-accent-text' },
];

const TILE =
  'flex min-w-0 flex-col rounded-[24px] border border-border bg-surface p-[clamp(22px,2.4vw,30px)]';
const H3 = 'font-display font-semibold';

/** Features bento (#features). Grid areas follow the prototype per breakpoint. */
export async function FeaturesBento() {
  const t = await getTranslations('landing.features');
  const locale = await getLocale();
  const n = (v: number) => formatInteger(v, locale);
  const mark = (chunks: ReactNode) => (
    <mark className="rounded-[3px] bg-accent-soft px-0.5 text-text">{chunks}</mark>
  );

  return (
    <section id="features" className={cn(WRAP, PAD_B, 'scroll-mt-20')}>
      <SectionHead
        eyebrow={t('eyebrow')}
        title={t('title')}
        titleClass="max-w-[20ch]"
        className="mb-[clamp(28px,4vw,48px)]"
      />
      <div className="grid gap-[clamp(12px,1.4vw,18px)] [grid-template-areas:'a'_'b'_'c'_'d'_'f'_'e'_'g'] md:grid-cols-2 md:[grid-template-areas:'a_a'_'b_b'_'c_d'_'f_f'_'e_e'_'g_g'] lg:grid-cols-4 lg:[grid-template-areas:'a_a_b_b'_'a_a_c_d'_'f_f_e_e'_'g_g_g_g']">
        <article className="flex min-w-0 flex-col gap-5 overflow-hidden rounded-[24px] bg-primary p-[clamp(22px,2.6vw,36px)] text-on-primary [grid-area:a]">
          <div className="flex flex-col gap-2.5">
            <h3 className={cn(H3, 'text-[length:clamp(26px,2.6vw,36px)] leading-[1.3]')}>
              {t('full.title')}
            </h3>
            <p className="max-w-[40ch] text-pretty opacity-90">{t('full.body')}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <OmrSheet label={t('full.sheetLabel')} />
            <div className="flex flex-wrap gap-x-[18px] gap-y-1.5 text-[14px]">
              <Legend className="bg-current opacity-95">{t('full.answered')}</Legend>
              <Legend className="bg-current opacity-55">{t('full.review')}</Legend>
              <Legend className="border-[1.5px] border-current opacity-70">{t('full.left')}</Legend>
            </div>
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-2 text-[16px] font-semibold">
            {(t.raw('full.meta') as string[]).map((m, i) => (
              <span key={m} className="contents">
                {i > 0 && <span className="opacity-60">·</span>}
                <span>{m}</span>
              </span>
            ))}
          </p>
        </article>

        <article className={cn(TILE, 'gap-4 [grid-area:b]')}>
          <h3 className={cn(H3, 'text-[24px] leading-[1.35]')}>{t('instant.title')}</h3>
          <div className="flex flex-col gap-2 text-[15px]">
            <AnswerChip tone="wrong" label={t('instant.yours')}>
              {t('instant.wrongOption')}
            </AnswerChip>
            <AnswerChip tone="right" label={t('instant.correct')}>
              {t('instant.rightOption')}
            </AnswerChip>
            <p className="mt-1 leading-[1.65] text-text-muted">{t('instant.explanation')}</p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3.5 text-[15px]">
            <Count dot="bg-success" label={t('instant.correctLabel')} value={n(SAMPLE.correct)} />
            <Count dot="bg-danger" label={t('instant.wrongLabel')} value={n(SAMPLE.wrong)} />
            <Count
              dot="bg-border-strong"
              label={t('instant.skippedLabel')}
              value={n(SAMPLE.skipped)}
            />
          </div>
        </article>

        <article className={cn(TILE, 'gap-3 [grid-area:c]')}>
          <h3 className={cn(H3, 'text-[20px] leading-[1.4]')}>{t('rank.title')}</h3>
          <p className="mt-auto font-display text-[length:clamp(40px,4vw,52px)] leading-[1.15] font-semibold">
            {n(SAMPLE.rank)}
            <span className="text-[0.5em]">{t('rank.suffix')}</span>
          </p>
          <p className="text-[15px] text-text-muted">
            {t('rank.detail', { total: formatDecimal(SAMPLE.of, locale), pct: n(SAMPLE.topPct) })}
          </p>
          <div aria-hidden className="relative h-2 rounded-[4px] bg-surface-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-[4px] bg-accent"
              style={{ right: `${SAMPLE.topPct}%` }}
            />
          </div>
        </article>

        <article className={cn(TILE, 'gap-3 [grid-area:d]')}>
          <h3 className={cn(H3, 'text-[20px] leading-[1.4]')}>{t('previous.title')}</h3>
          <p className="mt-auto font-display text-[length:clamp(34px,3.4vw,44px)] leading-[1.2] font-semibold">
            {t('previous.value')}
          </p>
          <p className="text-[15px] text-text-muted">{t('previous.detail')}</p>
        </article>

        <article className={cn(TILE, 'gap-4 [grid-area:e]')}>
          <h3 className={cn(H3, 'text-[24px] leading-[1.35]')}>{t('search.title')}</h3>
          <div className="flex min-h-12 items-center gap-2.5 rounded-[12px] border-[1.5px] border-text bg-bg px-3.5">
            <Search aria-hidden size={20} strokeWidth={2} className="flex-none" />
            <span>{t('search.query')}</span>
            <span aria-hidden className="h-5 w-0.5 bg-primary" />
          </div>
          <ul className="flex flex-col text-[15px]">
            <li className="flex justify-between gap-3 border-b border-border py-2">
              <span>{t.rich('search.first', { mark })}</span>
              <span className="whitespace-nowrap text-text-subtle">{t('search.firstTag')}</span>
            </li>
            <li className="flex justify-between gap-3 py-2">
              <span>{t.rich('search.second', { mark })}</span>
              <span className="whitespace-nowrap text-text-subtle">{t('search.secondTag')}</span>
            </li>
          </ul>
        </article>

        <article className={cn(TILE, 'gap-4 [grid-area:f]')}>
          <h3 className={cn(H3, 'text-[24px] leading-[1.35]')}>{t('practice.title')}</h3>
          <div className="flex flex-col gap-3 text-[15px]">
            {(t.raw('practice.topics') as string[]).map((topic, i) => {
              const w = WEAK[i]!;
              return (
                <div
                  key={topic}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                >
                  <span>{topic}</span>
                  <span className={cn('font-semibold', w.text)}>{n(w.pct)}%</span>
                  <div className="col-span-full h-1.5 rounded-[3px] bg-surface-muted">
                    <div
                      className={cn('h-full rounded-[3px]', w.bar)}
                      style={{ width: `${w.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <span className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-pill bg-text px-3.5 text-[14px] font-semibold text-bg">
              {t('practice.cta')}
              <ArrowRight aria-hidden size={16} strokeWidth={2.2} />
            </span>
          </div>
        </article>

        <article className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-4 rounded-[24px] bg-surface-muted p-[clamp(22px,2.4vw,30px)] [grid-area:g]">
          <div className="flex flex-[1_1_300px] flex-col gap-1.5">
            <h3 className={cn(H3, 'text-[24px] leading-[1.35]')}>{t('devices.title')}</h3>
            <p className="text-text-muted">{t('devices.body')}</p>
          </div>
          <div className="flex flex-[1_1_300px] items-center gap-2">
            {(t.raw('devices.list') as string[]).map((d, i) => (
              <span key={d} className="contents">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="w-[clamp(12px,2vw,28px)] border-t-2 border-dashed border-border-strong"
                  />
                )}
                <span className="flex-1 rounded-[14px] border border-border bg-surface px-2 py-3 text-center text-[15px] font-semibold">
                  {d}
                </span>
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[7px]">
      <span className={cn('size-3 rounded-pill', className)} />
      {children}
    </span>
  );
}

function AnswerChip({
  tone,
  label,
  children,
}: {
  tone: 'right' | 'wrong';
  label: string;
  children: ReactNode;
}) {
  const right = tone === 'right';
  const Icon = right ? Check : X;
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-[12px] border-[1.5px] px-3 py-2',
        right ? 'border-success bg-success-soft' : 'border-danger bg-danger-soft',
      )}
    >
      <span
        className={cn(
          'grid size-6 flex-none place-items-center rounded-pill text-(--brand-on-solid)',
          right ? 'bg-success' : 'bg-danger',
        )}
      >
        <Icon aria-hidden size={14} strokeWidth={3} />
      </span>
      <span className="flex-1">{children}</span>
      <span className={cn('font-semibold', right ? 'text-(--brand-oki)' : 'text-(--brand-eri)')}>
        {label}
      </span>
    </div>
  );
}

function Count({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-2.5 rounded-pill', dot)} />
      <span className="text-text-muted">{label}</span>
      <strong className="font-semibold">{value}</strong>
    </span>
  );
}
