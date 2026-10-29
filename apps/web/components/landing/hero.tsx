import { formatDecimal, formatInteger } from '@mcq/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { HeroLiveCard } from './hero-live-card';
import { Stars } from './stars';
import { StoreBadges } from './store-badges';

/**
 * Sample figures from the design. They are placeholders until GET /public/landing exists
 * (design/landing/contract-change-landing.md); swap them for the API values then.
 */
const RATING = 4.83;
const LEARNERS = 1258;
const PARTICIPANTS = 1240;
const BOARD = [91.5, 89, 88.5];
const YOU = { rank: 87, score: 72.5, rise: 12 };

const ROW =
  'grid grid-cols-[--spacing(9)_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-3 py-2.25';

/** Hero variant A "Live exam" (design/landing/landing-page.html), measurements as in the prototype. */
export async function Hero() {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const n = (v: number) => formatInteger(v, locale);
  const d = (v: number) => formatDecimal(v, locale);
  const rows = t.raw('live.rows') as { name: string; district: string }[];

  return (
    <section className="mx-auto grid max-w-(--breakpoint-xl) items-center gap-[clamp(--spacing(8),4vw,--spacing(16))] px-[clamp(--spacing(4),4vw,--spacing(14))] pt-[clamp(--spacing(6),3vw,--spacing(12))] pb-[clamp(--spacing(10),4vw,--spacing(16))] text-question leading-[1.65] text-text lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(--spacing(4.5),2vw,--spacing(6))]">
        <span className="landing-glow inline-flex items-center gap-2.5 self-start rounded-pill border border-primary/45 bg-surface py-1.5 pr-4 pl-3 text-body-sm leading-[1.65] font-semibold text-(--brand-pri)">
          <span aria-hidden className="relative size-2 flex-none">
            <span className="landing-ping absolute inset-0 rounded-pill bg-primary" />
            <span className="absolute inset-0 rounded-pill bg-primary" />
          </span>
          {t('hero.eyebrow')}
        </span>
        <h1 className="font-display text-[length:clamp(var(--mcq-font-size-hero-display-sm),3.4vw,var(--mcq-font-size-hero-display))] leading-[1.28] font-semibold tracking-[-0.005em] text-balance">
          {t('hero.titleLead')} <span className="landing-mark">{t('hero.titleMark')}</span>
        </h1>
        <p className="max-w-[44ch] text-[length:clamp(var(--mcq-font-size-question),1.4vw,var(--mcq-font-size-lead))] leading-[1.65] text-pretty text-text-muted">
          {t('hero.body')}
        </p>
        <div className="mt-1 flex flex-col gap-2.5">
          <StoreBadges />
          <Link
            href="/register"
            className="group inline-flex min-h-11 items-center gap-1.5 self-start text-body whitespace-nowrap text-text-muted underline underline-offset-4 transition-colors duration-(--mcq-duration-base) hover:text-text"
          >
            <span>{t('hero.webLink')}</span>
            {/* Two arrows in a clipped box: on hover the first slides out and the next slides in. */}
            <span
              aria-hidden
              className="relative inline-block h-[1.4em] w-[1.15em] overflow-hidden no-underline"
            >
              <span className="absolute top-0 left-0 flex -translate-x-[1.15em] transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:translate-x-0 group-focus-visible:translate-x-0">
                <span className="w-[1.15em] leading-[1.4em]">→</span>
                <span className="w-[1.15em] leading-[1.4em]">→</span>
              </span>
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-border pt-4 text-meta leading-[1.65] text-text-muted">
          <span className="flex items-center gap-2">
            <Stars className="size-4.5" />
            <strong
              className="font-semibold text-text"
              aria-label={t('hero.ratingLabel', { rating: d(RATING) })}
            >
              {d(RATING)}
            </strong>
          </span>
          <span aria-hidden className="h-4.5 w-px bg-border-strong" />
          <span>{t('hero.learners', { count: d(LEARNERS) })}</span>
        </div>
      </div>

      <div className="flex w-full max-w-140 min-w-0 flex-col gap-4 justify-self-center">
        <HeroLiveCard />
        <div className="landing-in landing-shadow flex flex-col gap-0.5 rounded-[20px] border border-border bg-surface px-3 pt-4 pb-3 [animation-delay:0.2s]">
          <div className="flex flex-wrap justify-between gap-2.5 px-3 pb-2">
            <strong className="text-body leading-[1.65] font-semibold">
              {t('live.boardTitle')}
            </strong>
            <span className="text-body-sm leading-[1.65] text-text-subtle">
              {t('live.participants', { count: d(PARTICIPANTS) })}
            </span>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.name}
              className={`landing-row-in ${ROW}`}
              style={{ animationDelay: `${0.5 + i * 0.1}s` }}
            >
              <strong className="font-display text-meta leading-[1.65] font-semibold text-text-subtle">
                {n(i + 1)}
              </strong>
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="text-meta leading-[1.3] font-medium">{row.name}</span>
                <span className="text-micro leading-[1.3] text-text-subtle">{row.district}</span>
              </span>
              <strong className="text-meta leading-[1.65] font-semibold">{d(BOARD[i]!)}</strong>
            </div>
          ))}
          <span aria-hidden className="px-3 tracking-[0.3em] text-text-subtle">
            ⋮
          </span>
          <div className={`landing-row-you ${ROW} border-[1.5px] border-primary bg-primary-soft`}>
            <strong className="font-display text-meta leading-[1.65] font-semibold text-(--brand-pri)">
              {n(YOU.rank)}
            </strong>
            <span className="flex min-w-0 flex-col leading-[1.3]">
              <span className="text-meta leading-[1.3] font-semibold">{t('live.you')}</span>
              <span className="text-micro leading-[1.3] text-text-subtle">
                {t('live.rise', { count: n(YOU.rise) })} <span className="landing-nudge">↑</span>
              </span>
            </span>
            <strong className="text-meta leading-[1.65] font-semibold">{d(YOU.score)}</strong>
          </div>
        </div>
        <span className="text-center text-micro leading-[1.65] text-text-subtle">
          {t('live.sample')}
        </span>
      </div>
    </section>
  );
}
