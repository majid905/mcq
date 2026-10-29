import { cn, formatDecimal, formatInteger } from '@mcq/ui';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/**
 * Fixed sample answer sheet: 70 answered, 5 marked for review, 25 left, shuffled with a seeded
 * generator so server and client agree.
 */
const SHEET = (() => {
  let seed = 20251;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const order = Array.from({ length: 100 }, (_, i) => i);
  for (let i = 99; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const out: ('answered' | 'review' | 'left')[] = Array.from({ length: 100 }, () => 'left');
  order.forEach((k, n) => {
    if (n < 70) out[k] = 'answered';
    else if (n < 75) out[k] = 'review';
  });
  return out;
})();

/** Illustration numbers for the sample result tiles. */
const SAMPLE = { correct: 79, wrong: 13, skipped: 8, rank: 87, of: 1240, topPct: 7 };
const WEAK = [
  { pct: 38, bar: 'bg-danger', text: 'text-danger' },
  { pct: 52, bar: 'bg-accent', text: 'text-accent-text' },
];

const tile = 'flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5.5 md:p-7.5';
const tileTitle = 'font-display font-semibold text-text';

/** Features bento (#features). Grid areas follow the prototype per breakpoint. */
export async function FeaturesBento() {
  const t = await getTranslations('landing.features');
  const locale = await getLocale();
  const n = (v: number) => formatInteger(v, locale);
  const mark = (chunks: ReactNode) => (
    <mark className="rounded-sm bg-accent-soft px-0.5 text-text">{chunks}</mark>
  );

  return (
    <section
      id="features"
      className="mx-auto max-w-(--breakpoint-xl) scroll-mt-20 px-4 pb-14 md:px-8 md:pb-20 lg:pb-28 xl:px-14"
    >
      <div className="mb-7 flex flex-col items-center gap-3 text-center md:mb-12">
        <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
        <h2 className="max-w-[20ch] font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
          {t('title')}
        </h2>
      </div>
      <div className="grid gap-3 [grid-template-areas:'a'_'b'_'c'_'d'_'f'_'e'_'g'] md:grid-cols-2 md:gap-4 md:[grid-template-areas:'a_a'_'b_b'_'c_d'_'f_f'_'e_e'_'g_g'] lg:grid-cols-4 lg:[grid-template-areas:'a_a_b_b'_'a_a_c_d'_'f_f_e_e'_'g_g_g_g']">
        <article className="flex min-w-0 flex-col gap-5 overflow-hidden rounded-xl bg-primary p-5.5 text-on-primary [grid-area:a] md:p-9">
          <div className="flex flex-col gap-2.5">
            <h3 className="font-display text-h1 font-semibold md:text-display md:leading-tight">
              {t('full.title')}
            </h3>
            <p className="max-w-[40ch] opacity-90">{t('full.body')}</p>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div
              role="img"
              aria-label={t('full.sheetLabel')}
              className="grid grid-cols-10 gap-1.5 md:grid-cols-20 md:gap-1.75"
            >
              {SHEET.map((s, i) => (
                <span
                  key={i}
                  className={cn(
                    'aspect-square rounded-pill border-[1.5px] border-current',
                    s === 'answered' && 'bg-current opacity-95',
                    s === 'review' && 'bg-current opacity-55',
                    s === 'left' && 'opacity-40',
                  )}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4.5 gap-y-1.5 text-body-sm">
              <Legend className="bg-current opacity-95">{t('full.answered')}</Legend>
              <Legend className="bg-current opacity-55">{t('full.review')}</Legend>
              <Legend className="border-[1.5px] border-current opacity-70">{t('full.left')}</Legend>
            </div>
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
            {(t.raw('full.meta') as string[]).map((m, i) => (
              <span key={m} className="contents">
                {i > 0 && <span className="opacity-60">·</span>}
                <span>{m}</span>
              </span>
            ))}
          </p>
        </article>

        <article className={cn(tile, 'gap-4 [grid-area:b]')}>
          <h3 className={cn(tileTitle, 'text-h2')}>{t('instant.title')}</h3>
          <div className="flex flex-col gap-2 text-body">
            <AnswerChip tone="wrong" label={t('instant.yours')}>
              {t('instant.wrongOption')}
            </AnswerChip>
            <AnswerChip tone="right" label={t('instant.correct')}>
              {t('instant.rightOption')}
            </AnswerChip>
            <p className="mt-1 text-text-muted">{t('instant.explanation')}</p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3.5 text-body">
            <Count dot="bg-success" label={t('instant.correctLabel')} value={n(SAMPLE.correct)} />
            <Count dot="bg-danger" label={t('instant.wrongLabel')} value={n(SAMPLE.wrong)} />
            <Count
              dot="bg-border-strong"
              label={t('instant.skippedLabel')}
              value={n(SAMPLE.skipped)}
            />
          </div>
        </article>

        <article className={cn(tile, 'gap-3 [grid-area:c]')}>
          <h3 className={cn(tileTitle, 'text-h3 md:text-h2')}>{t('rank.title')}</h3>
          <p className="mt-auto font-display text-display leading-tight font-semibold text-text md:text-hero-display-sm">
            {n(SAMPLE.rank)}
            <span className="text-[0.5em]">{t('rank.suffix')}</span>
          </p>
          <p className="text-body text-text-muted">
            {t('rank.detail', { total: formatDecimal(SAMPLE.of, locale), pct: n(SAMPLE.topPct) })}
          </p>
          <div aria-hidden className="relative h-2 rounded-pill bg-surface-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-pill bg-accent"
              style={{ right: `${SAMPLE.topPct}%` }}
            />
          </div>
        </article>

        <article className={cn(tile, 'gap-3 [grid-area:d]')}>
          <h3 className={cn(tileTitle, 'text-h3 md:text-h2')}>{t('previous.title')}</h3>
          <p className="mt-auto font-display text-display leading-tight font-semibold text-text">
            {t('previous.value')}
          </p>
          <p className="text-body text-text-muted">{t('previous.detail')}</p>
        </article>

        <article className={cn(tile, 'gap-4 [grid-area:e]')}>
          <h3 className={cn(tileTitle, 'text-h2')}>{t('search.title')}</h3>
          <div className="flex min-h-12 items-center gap-2.5 rounded-md border-[1.5px] border-text bg-bg px-3.5">
            <Search aria-hidden size={20} strokeWidth={2} />
            <span>{t('search.query')}</span>
            <span aria-hidden className="h-5 w-0.5 bg-primary" />
          </div>
          <ul className="flex flex-col text-body">
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

        <article className={cn(tile, 'gap-4 [grid-area:f]')}>
          <h3 className={cn(tileTitle, 'text-h2')}>{t('practice.title')}</h3>
          <div className="flex flex-col gap-3 text-body">
            {(t.raw('practice.topics') as string[]).map((topic, i) => {
              const w = WEAK[i]!;
              return (
                <div
                  key={topic}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                >
                  <span>{topic}</span>
                  <span className={cn('font-semibold', w.text)}>{n(w.pct)}%</span>
                  <div className="col-span-full h-1.5 rounded-pill bg-surface-muted">
                    <div
                      className={cn('h-full rounded-pill', w.bar)}
                      style={{ width: `${w.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <span className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-pill bg-text px-3.5 text-body-sm font-semibold text-bg">
              {t('practice.cta')}
              <ArrowRight aria-hidden size={16} strokeWidth={2.2} />
            </span>
          </div>
        </article>

        <article className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-4 rounded-xl bg-surface-muted p-5.5 [grid-area:g] md:p-7.5">
          <div className="flex flex-[1_1_300px] flex-col gap-1.5">
            <h3 className={cn(tileTitle, 'text-h2')}>{t('devices.title')}</h3>
            <p className="text-text-muted">{t('devices.body')}</p>
          </div>
          <div className="flex flex-[1_1_300px] items-center gap-2">
            {(t.raw('devices.list') as string[]).map((d, i) => (
              <span key={d} className="contents">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="w-3 border-t-2 border-dashed border-border-strong md:w-7"
                  />
                )}
                <span className="flex-1 rounded-lg border border-border bg-surface px-2 py-3 text-center font-semibold">
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
    <span className="inline-flex items-center gap-1.75">
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
        'flex items-center gap-2.5 rounded-md border-[1.5px] px-3 py-2',
        right ? 'border-success bg-success-soft' : 'border-danger bg-danger-soft',
      )}
    >
      <span
        className={cn(
          'grid size-6 flex-none place-items-center rounded-pill text-on-primary',
          right ? 'bg-success' : 'bg-danger',
        )}
      >
        <Icon aria-hidden size={14} strokeWidth={3} />
      </span>
      <span className="flex-1">{children}</span>
      <span className={cn('font-semibold', right ? 'text-success' : 'text-danger')}>{label}</span>
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
