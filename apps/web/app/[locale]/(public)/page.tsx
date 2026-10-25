import { AppButton, AppCard, AppChip, formatInteger } from '@mcq/ui';
import {
  BarChart3,
  CheckCircle2,
  Crown,
  Radio,
  Smartphone,
  Trophy,
  NotebookPen,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { publicApi, publicData } from '@/lib/server/public-api';

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

const FEATURES = [
  { key: 'live', icon: Radio },
  { key: 'practice', icon: NotebookPen },
  { key: 'rank', icon: Trophy },
  { key: 'analytics', icon: BarChart3 },
] as const;

const FAQ = ['free', 'device', 'payment', 'offline'] as const;

/** K Landing (server-rendered for SEO). Packages come from the public GET /packages. */
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

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:items-center md:py-20">
          <div className="flex flex-col gap-5">
            <AppChip variant="live" className="self-start">
              {t('heroBadge')}
            </AppChip>
            <h1 className="text-display font-bold text-text md:text-[40px] md:leading-tight">
              {t('heroTitle')}
            </h1>
            <p className="max-w-reading text-body text-text-muted md:text-h3 md:font-normal">
              {t('heroBody')}
            </p>
            <div className="flex flex-wrap gap-3">
              <AppButton asChild>
                <Link href="/register">{t('ctaStart')}</Link>
              </AppButton>
              <AppButton asChild variant="secondary">
                <Link href="/login">{t('ctaLogin')}</Link>
              </AppButton>
            </div>
            {settings?.free_live_exams_per_month !== undefined && (
              <p className="flex items-center gap-2 text-body-sm text-text-muted">
                <CheckCircle2 aria-hidden size={16} className="text-success" />
                {t('freeLine', {
                  live: n(settings.free_live_exams_per_month),
                  practice: n(settings.free_practice_per_day ?? 0),
                })}
              </p>
            )}
          </div>
          {/* Product preview built from the same components as the app. */}
          <div
            aria-hidden
            className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-4 shadow-md"
          >
            <AppCard live>
              <div className="flex items-center justify-between">
                <AppChip variant="live">{t('preview.live')}</AppChip>
                <span className="text-caption text-text-muted">{t('preview.left')}</span>
              </div>
              <p className="mt-2 text-h3 font-semibold text-text">{t('preview.title')}</p>
              <p className="mt-1 text-body-sm text-text-muted">{t('preview.meta')}</p>
            </AppCard>
            <div className="flex flex-col gap-2">
              {(['a', 'b'] as const).map((k, i) => (
                <div
                  key={k}
                  className={
                    i === 1
                      ? 'flex min-h-12 items-center gap-3 rounded-md border-[1.5px] border-primary bg-primary-soft px-3'
                      : 'flex min-h-12 items-center gap-3 rounded-md border-[1.5px] border-border bg-surface px-3'
                  }
                >
                  <span
                    className={
                      i === 1
                        ? 'grid size-7 place-items-center rounded-pill bg-primary text-caption font-semibold text-on-primary'
                        : 'grid size-7 place-items-center rounded-pill bg-surface-muted text-caption font-semibold text-text-muted'
                    }
                  >
                    {locale === 'bn' ? ['ক', 'খ'][i] : ['A', 'B'][i]}
                  </span>
                  <span className="text-body-sm text-text">{t(`preview.option.${k}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-14" aria-labelledby="features">
        <h2 id="features" className="text-h1 font-bold text-text">
          {t('featuresTitle')}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key}>
              <AppCard className="h-full">
                <span className="grid size-10 place-items-center rounded-md bg-primary-soft text-primary">
                  <Icon aria-hidden size={22} strokeWidth={1.75} />
                </span>
                <h3 className="mt-3 text-h3 font-semibold text-text">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="mt-1 text-body-sm text-text-muted">{t(`features.${key}.body`)}</p>
              </AppCard>
            </li>
          ))}
        </ul>
      </section>

      {packages && packages.length > 0 && (
        <section className="border-y border-border bg-surface" aria-labelledby="plans">
          <div className="mx-auto max-w-content px-4 py-14">
            <h2 id="plans" className="text-h1 font-bold text-text">
              {t('plansTitle')}
            </h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-3">
              {packages.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <AppCard className={p.is_featured ? 'h-full border-2 border-accent' : 'h-full'}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-h3 font-semibold text-text">{p.name}</h3>
                      {p.is_featured && (
                        <AppChip variant="accent" icon={<Crown aria-hidden size={14} />}>
                          {t('popular')}
                        </AppChip>
                      )}
                    </div>
                    <p className="mt-3 text-stat font-bold tabular-nums text-text">
                      ৳{n(p.price_bdt ?? 0)}
                      <span className="ml-1 text-body-sm font-normal text-text-muted">
                        / {t('days', { count: n(p.duration_days ?? 0) })}
                      </span>
                    </p>
                    {(p.features ?? []).length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {(p.features ?? []).slice(0, 4).map((f) => (
                          <li key={f} className="flex gap-2 text-body-sm text-text-muted">
                            <CheckCircle2
                              aria-hidden
                              size={16}
                              className="mt-0.5 flex-none text-success"
                            />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </AppCard>
                </li>
              ))}
            </ul>
            <AppButton asChild variant="secondary" className="mt-6">
              <Link href="/plans">{t('allPlans')}</Link>
            </AppButton>
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-content gap-10 px-4 py-14 md:grid-cols-2">
        <div>
          <h2 className="text-h1 font-bold text-text">{t('appTitle')}</h2>
          <p className="mt-2 text-body text-text-muted">{t('appBody')}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-3 text-body-sm text-text-muted">
            <Smartphone aria-hidden size={18} className="text-primary" />
            {t('appSoon')}
          </p>
        </div>
        <div>
          <h2 className="text-h1 font-bold text-text">{t('faqTitle')}</h2>
          <div className="mt-4 flex flex-col gap-2">
            {FAQ.map((key) => (
              <details
                key={key}
                className="group rounded-md border border-border bg-surface px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-body font-semibold text-text marker:hidden">
                  {t(`faq.${key}.q`)}
                </summary>
                <p className="mt-2 text-body-sm text-text-muted">{t(`faq.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
