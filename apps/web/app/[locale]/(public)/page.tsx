import { fillTemplate, formatInteger } from '@mcq/ui';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppDownload } from '@/components/landing/app-download';
import { Faq } from '@/components/landing/faq';
import { FeaturesBento } from '@/components/landing/features-bento';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Pricing } from '@/components/landing/pricing';
import { ResultPreview } from '@/components/landing/result-preview';
import { ReviewsMarquee } from '@/components/landing/reviews-marquee';
import { TryQuestion } from '@/components/landing/try-question';
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

/**
 * K Landing (design/landing). Server-rendered for SEO; packages and the free quota come from the
 * public API. The hero's live-exam and social-proof figures are the design's samples until
 * GET /public/landing exists (design/landing/contract-change-landing.md).
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
  const quota = settings?.free_live_exams_per_month !== undefined && {
    live: n(settings.free_live_exams_per_month),
    practice: n(settings.free_practice_per_day ?? 0),
  };

  return (
    <>
      <Hero />
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
