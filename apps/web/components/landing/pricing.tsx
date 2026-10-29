import type { components } from '@mcq/api-client-ts';
import { cn, formatDecimal } from '@mcq/ui';
import { Check } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { perMonth } from '@/lib/billing/price';
import { PAD_Y, SectionHead, WRAP } from './layout';

type Package = components['schemas']['Package'];

const CTA =
  'flex min-h-12 items-center justify-center rounded-[12px] font-semibold transition-colors duration-(--mcq-duration-fast)';

/**
 * Pricing (#pricing): the free card from the design copy plus the paid plans from GET /packages
 * (`is_featured` gets the "best value" badge and the filled button).
 */
export async function Pricing({ packages }: { packages: Package[] }) {
  const t = await getTranslations('landing.pricing');
  const locale = await getLocale();
  const money = (v: number) => t('price', { amount: formatDecimal(v, locale) });

  return (
    <section id="pricing" className={cn(WRAP, PAD_Y, 'scroll-mt-20')}>
      <SectionHead
        eyebrow={t('eyebrow')}
        title={t('title')}
        sub={t('intro')}
        className="mb-[clamp(28px,4vw,48px)]"
      />
      <ul className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PlanCard
          name={t('free.name')}
          subtitle={t('free.tag')}
          price={money(0)}
          features={t.raw('free.features') as string[]}
          cta={
            <Link
              href="/register"
              className={cn(CTA, 'border-[1.5px] border-text text-text hover:bg-surface-muted')}
            >
              {t('free.cta')}
            </Link>
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
                <Link
                  href={`/checkout/${p.id}`}
                  className={cn(
                    CTA,
                    featured
                      ? 'bg-primary text-on-primary hover:bg-primary-hover'
                      : 'border-[1.5px] border-text text-text hover:bg-surface-muted',
                  )}
                >
                  {t('buy', { name: p.name ?? '' })}
                </Link>
              }
            />
          );
        })}
      </ul>
      <p className="mt-6 flex flex-wrap items-center gap-2.5 text-[15px] text-text-muted">
        <span>{t('payWith')}</span>
        {(t.raw('methods') as string[]).map((m, i) => (
          <span
            key={m}
            className={cn(
              'rounded-[8px] border border-border-strong px-3 py-1 font-semibold text-text',
              i < 2 && 'font-sans',
            )}
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
        'relative flex flex-col gap-[18px] rounded-[22px] bg-surface px-6 py-[26px]',
        featured
          ? 'border-2 border-primary shadow-[0_24px_48px_-32px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'
          : 'border border-border',
      )}
    >
      {badge && (
        <span className="absolute -top-3.5 left-[22px] rounded-pill bg-accent px-3 py-[3px] text-[14px] font-semibold text-on-accent">
          {badge}
        </span>
      )}
      <div>
        <h3 className="font-display text-[22px] leading-[1.35] font-semibold">{name}</h3>
        {subtitle && (
          <p
            className={cn(
              'mt-0.5 text-[15px]',
              featured ? 'font-semibold text-(--brand-pri)' : 'text-text-subtle',
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div className="font-display text-[44px] leading-[1.15] font-semibold">
        {price}
        {unit && <span className="text-[17px] font-medium text-text-subtle"> {unit}</span>}
      </div>
      <ul className="flex flex-1 flex-col gap-2.5 text-[16px]">
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
