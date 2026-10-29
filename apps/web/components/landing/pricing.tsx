import type { components } from '@mcq/api-client-ts';
import { AppButton, cn, formatDecimal, formatInteger } from '@mcq/ui';
import { Check } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { perMonth } from '@/lib/billing/price';

type Package = components['schemas']['Package'];
type PublicSettings = components['schemas']['PublicSettings'];

/**
 * Pricing (#pricing): a free card from GET /settings/public plus the paid plans from GET /packages
 * (`is_featured` gets the "best value" badge). Nothing about plans is hardcoded.
 */
export async function Pricing({
  packages,
  settings,
}: {
  packages: Package[];
  settings: PublicSettings | null;
}) {
  const t = await getTranslations('landing.pricing');
  const locale = await getLocale();
  const money = (v: number) => t('price', { amount: formatDecimal(v, locale) });

  const freeFeatures = [
    settings?.free_live_exams_per_month !== undefined &&
      t('free.live', { count: formatInteger(settings.free_live_exams_per_month, locale) }),
    settings?.free_practice_per_day !== undefined &&
      t('free.practice', { count: formatInteger(settings.free_practice_per_day, locale) }),
    t('free.result'),
  ].filter((f): f is string => Boolean(f));

  return (
    <section
      id="pricing"
      className="mx-auto max-w-(--breakpoint-xl) scroll-mt-20 px-4 py-14 md:px-8 md:py-20 lg:py-28 xl:px-14"
    >
      <div className="mb-7 flex flex-col items-center gap-3 text-center md:mb-12">
        <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
        <h2 className="font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
          {t('title')}
        </h2>
        <p className="text-body text-text-muted">{t('intro')}</p>
      </div>
      <ul className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PlanCard
          name={t('free.name')}
          subtitle={t('free.tag')}
          price={money(0)}
          features={freeFeatures}
          cta={
            <AppButton asChild variant="secondary" fullWidth className="h-12 border-text">
              <Link href="/register">{t('free.cta')}</Link>
            </AppButton>
          }
        />
        {packages.slice(0, 3).map((p) => {
          const months = Math.max(1, Math.round((p.duration_days ?? 30) / 30));
          const monthly = formatDecimal(perMonth(p), locale);
          const featured = Boolean(p.is_featured);
          return (
            <PlanCard
              key={p.id}
              featured={featured}
              badge={featured ? t('best') : undefined}
              name={p.name ?? ''}
              subtitle={
                months === 1
                  ? (p.description ?? undefined)
                  : t(featured ? 'perMonthBest' : 'perMonth', { amount: monthly })
              }
              price={money(p.price_bdt ?? 0)}
              unit={months === 1 ? t('perMonthUnit') : undefined}
              features={p.features ?? []}
              cta={
                <AppButton
                  asChild
                  variant={featured ? 'primary' : 'secondary'}
                  fullWidth
                  className={cn('h-12', !featured && 'border-text')}
                >
                  <Link href={`/checkout/${p.id}`}>{t('buy', { name: p.name ?? '' })}</Link>
                </AppButton>
              }
            />
          );
        })}
      </ul>
      <p className="mt-6 flex flex-wrap items-center gap-2.5 text-body text-text-muted">
        <span>{t('payWith')}</span>
        {(t.raw('methods') as string[]).map((m) => (
          <span
            key={m}
            className="rounded-sm border border-border-strong px-3 py-1 font-semibold text-text"
          >
            {m}
          </span>
        ))}
      </p>
    </section>
  );
}

function PlanCard({
  name,
  subtitle,
  price,
  unit,
  features,
  cta,
  featured,
  badge,
}: {
  name: string;
  subtitle?: string;
  price: string;
  unit?: string;
  features: string[];
  cta: ReactNode;
  featured?: boolean;
  badge?: string;
}) {
  return (
    <li
      className={cn(
        'relative flex flex-col gap-4.5 rounded-xl bg-surface px-6 py-6.5',
        featured ? 'border-2 border-primary shadow-lg' : 'border border-border',
      )}
    >
      {badge && (
        <span className="absolute -top-3.5 left-5.5 rounded-pill bg-accent px-3 py-0.75 text-body-sm font-semibold text-on-accent">
          {badge}
        </span>
      )}
      <div>
        <h3 className="font-display text-h2 font-semibold text-text">{name}</h3>
        {subtitle && (
          <p
            className={cn(
              'mt-0.5 text-body',
              featured ? 'font-semibold text-primary' : 'text-text-subtle',
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      <p className="font-display text-hero-display-sm leading-tight font-semibold text-text tabular-nums">
        {price}
        {unit && <span className="text-question font-medium text-text-subtle"> {unit}</span>}
      </p>
      <ul className="flex flex-1 flex-col gap-2.5 text-body">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check
              aria-hidden
              size={18}
              strokeWidth={2.6}
              className="mt-1 flex-none text-primary"
            />
            {f}
          </li>
        ))}
      </ul>
      {cta}
    </li>
  );
}
