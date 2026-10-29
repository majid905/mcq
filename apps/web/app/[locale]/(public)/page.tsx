import { fillTemplate, formatDecimal, formatInteger } from '@mcq/ui';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppDownload } from '@/components/landing/app-download';
import { Faq } from '@/components/landing/faq';
import { FeaturesBento } from '@/components/landing/features-bento';
import { HeroLiveCard } from '@/components/landing/hero-live-card';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Pricing } from '@/components/landing/pricing';
import { ResultPreview } from '@/components/landing/result-preview';
import { ReviewsMarquee } from '@/components/landing/reviews-marquee';
import { StoreBadges } from '@/components/landing/store-badges';
import { TryQuestion } from '@/components/landing/try-question';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { publicApi, publicData } from '@/lib/server/public-api';
import '@/components/landing/landing.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'landing' });
  return {
    title: { absolute: t('metaTitle') },
    description: t('metaDescription'),
    alternates: { languages: { bn: '/', en: '/en' } },
  };
}

/** Sample merit list for the hero (labelled "sample data" on the page). */
const BOARD = [91.5, 89, 88.5];
const YOU = { rank: 87, score: 72.5, rise: 12 };

/**
 * K Landing (design/landing). Server-rendered for SEO; packages and the free quota come from the
 * public API. Live-exam figures (next exam, countdown, enrolled count, last merit list) have no
 * public endpoint yet, so they are not shown — see the contract-change request for
 * GET /public/landing.
 */
export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations('landing');
  const api = publicApi(locale);
  const [packages, settings] = await Promise.all([
    publicData(api.GET('/packages')),
    publicData(api.GET('/settings/public')),
  ]);
  const n = (v: number) => formatInteger(v, locale);
  const d = (v: number) => formatDecimal(v, locale);
  const quota = settings?.free_live_exams_per_month !== undefined && {
    live: n(settings.free_live_exams_per_month),
    practice: n(settings.free_practice_per_day ?? 0),
  };
  const rows = t.raw('live.rows') as { name: string; district: string }[];

  return (
    <>
      <section className="mx-auto grid max-w-(--breakpoint-xl) items-center gap-8 px-4 pt-6 pb-10 md:px-8 md:pt-10 lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)] lg:gap-16 lg:pb-16 xl:px-14">
        <div className="flex min-w-0 flex-col gap-4.5 md:gap-6">
          <span className="landing-glow inline-flex items-center gap-2.5 self-start rounded-pill border border-primary/45 bg-surface py-1.5 pr-4 pl-3 text-body-sm font-semibold text-primary">
            <span aria-hidden className="relative size-2 flex-none">
              <span className="landing-ping absolute inset-0 rounded-pill bg-primary" />
              <span className="absolute inset-0 rounded-pill bg-primary" />
            </span>
            {t('hero.eyebrow')}
          </span>
          <h1 className="font-display text-hero-display-sm leading-tight font-semibold text-balance text-text xl:text-hero-display">
            {t('hero.titleLead')} <span className="landing-mark">{t('hero.titleMark')}</span>
          </h1>
          <p className="max-w-[44ch] text-question text-pretty text-text-muted md:text-h3 md:leading-relaxed md:font-normal">
            {t('hero.body')}
          </p>
          <div className="mt-1 flex flex-col gap-2.5">
            <StoreBadges />
            <Link
              href="/register"
              className="group inline-flex min-h-11 items-center gap-1.5 self-start text-body whitespace-nowrap text-text-muted underline-offset-4 transition-colors duration-(--mcq-duration-base) hover:text-text"
            >
              <span>{t('hero.webLink')}</span>
              {/* Two arrows in a clipped box: the first slides out, the second slides in. */}
              <span
                aria-hidden
                className="relative inline-flex h-[1.4em] w-[1.15em] overflow-hidden"
              >
                <span className="absolute top-0 left-0 flex -translate-x-1/2 transition-transform duration-500 ease-standard group-hover:translate-x-0 group-focus-visible:translate-x-0 motion-reduce:transition-none">
                  <ArrowRight size="1.15em" strokeWidth={2} className="my-[0.125em]" />
                  <ArrowRight size="1.15em" strokeWidth={2} className="my-[0.125em]" />
                </span>
              </span>
            </Link>
          </div>
          {quota && (
            <p className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-border pt-4 text-body text-text-muted">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 aria-hidden size={18} className="text-success" />
                {t('hero.freeLine', quota)}
              </span>
              <span>{t('hero.noCard')}</span>
            </p>
          )}
        </div>

        <div className="flex w-full max-w-140 min-w-0 flex-col gap-4 justify-self-center">
          <HeroLiveCard exam={null} />
          <div className="landing-in flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 pt-4 pb-3 shadow-lg [animation-delay:0.2s]">
            <div className="flex flex-wrap justify-between gap-2.5 px-3 pb-2">
              <strong className="text-body font-semibold">{t('live.boardTitle')}</strong>
              <span className="text-body-sm text-text-subtle">{t('live.sample')}</span>
            </div>
            {rows.map((row, i) => (
              <div
                key={row.name}
                className="landing-row-in grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-3 py-2.25"
                style={{ animationDelay: `${0.5 + i * 0.1}s` }}
              >
                <strong className="font-display text-body font-semibold text-text-subtle">
                  {n(i + 1)}
                </strong>
                <span className="flex min-w-0 flex-col leading-snug">
                  <span className="text-body font-medium">{row.name}</span>
                  <span className="text-body-sm text-text-subtle">{row.district}</span>
                </span>
                <strong className="text-body font-semibold">{d(BOARD[i]!)}</strong>
              </div>
            ))}
            <span aria-hidden className="px-3 tracking-[0.3em] text-text-subtle">
              ⋮
            </span>
            <div className="landing-row-you grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border-[1.5px] border-primary bg-primary-soft px-3 py-2.25">
              <strong className="font-display text-body font-semibold text-primary">
                {n(YOU.rank)}
              </strong>
              <span className="flex min-w-0 flex-col leading-snug">
                <span className="text-body font-semibold">{t('live.you')}</span>
                <span className="text-body-sm text-text-subtle">
                  {t('live.rise', { count: n(YOU.rise) })} <span className="landing-nudge">↑</span>
                </span>
              </span>
              <strong className="text-body font-semibold">{d(YOU.score)}</strong>
            </div>
          </div>
        </div>
      </section>

      <TryQuestion />
      <HowItWorks />
      <FeaturesBento />
      <ResultPreview />
      <ReviewsMarquee />
      <Pricing packages={packages ?? []} settings={settings} />
      <AppDownload />
      <Faq
        title={t('faq.title')}
        // The first answer quotes the free quota; it is left out while settings are unavailable.
        items={(t.raw('faq.items') as { q: string; a: string }[])
          .filter((_, i) => i !== 0 || quota)
          .map((item) => ({ q: item.q, a: quota ? fillTemplate(item.a, quota) : item.a }))}
      />
    </>
  );
}
