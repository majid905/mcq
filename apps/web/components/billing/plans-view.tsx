'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
  formatDecimal,
} from '@mcq/ui';
import { CheckCircle2, Crown } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { type Package, perMonth, usePackages, useSignedIn } from '@/lib/billing/queries';
import { useErrorText } from '@/lib/hooks';
import { useMe } from '@/lib/queries';

function CurrentPlan() {
  const t = useTranslations('plans');
  const format = useFormatter();
  const me = useMe();
  const sub = me.data?.subscription;
  if (!sub) return null;
  return (
    <AppCard
      className={cn(
        'flex items-center gap-3',
        sub.is_premium ? 'border-accent bg-accent-soft' : '',
      )}
      data-testid="current-plan"
    >
      <Crown
        aria-hidden
        size={22}
        className={sub.is_premium ? 'text-accent-text' : 'text-text-muted'}
      />
      <p className="text-body text-text">
        {sub.is_premium && sub.ends_at
          ? t('premiumUntil', {
              date: format.dateTime(new Date(sub.ends_at), { dateStyle: 'medium' }),
            })
          : sub.trial_available
            ? t('trialAvailable')
            : t('free')}
      </p>
    </AppCard>
  );
}

function PlanCard({ p }: { p: Package }) {
  const t = useTranslations('plans');
  const locale = useLocale();
  const money = (v: number) => `৳${formatDecimal(v, locale, 0)}`;
  const months = Math.max(1, Math.round((p.duration_days ?? 30) / 30));
  return (
    <AppCard
      data-testid="plan"
      className={cn('flex h-full flex-col gap-4', p.is_featured && 'border-2 border-accent')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-h3 font-semibold text-text">{p.name}</h2>
          {p.description && <p className="mt-1 text-body-sm text-text-muted">{p.description}</p>}
        </div>
        {p.is_featured && (
          <AppChip variant="accent" icon={<Crown aria-hidden size={14} />}>
            {t('popular')}
          </AppChip>
        )}
      </div>
      <div>
        <p className="flex items-baseline gap-2">
          <span className="text-stat font-bold tabular-nums text-text">
            {money(p.price_bdt ?? 0)}
          </span>
          {p.compare_at_bdt ? (
            <s
              className="text-body text-text-subtle"
              aria-label={t('wasPrice', { price: money(p.compare_at_bdt) })}
            >
              {money(p.compare_at_bdt)}
            </s>
          ) : null}
        </p>
        <p className="text-body-sm text-text-muted">
          {t('duration', { days: formatDecimal(p.duration_days ?? 0, locale, 0) })}
          {months > 1 && ` · ${t('perMonth', { price: money(perMonth(p)) })}`}
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {(p.features ?? []).map((f) => (
          <li key={f} className="flex gap-2 text-body-sm text-text">
            <CheckCircle2 aria-hidden size={18} className="flex-none text-success" />
            {f}
          </li>
        ))}
      </ul>
      <AppButton asChild fullWidth variant={p.is_featured ? 'primary' : 'secondary'}>
        <Link href={`/checkout/${p.id}`}>{t('buy')}</Link>
      </AppButton>
    </AppCard>
  );
}

/** I1 Packages (FR-PAY-01, 04). Public page; the current plan shows when signed in. */
export function PlansView() {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const signedIn = useSignedIn();
  const packages = usePackages();

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
        <p className="mt-2 text-body text-text-muted">{t('subtitle')}</p>
      </div>
      {signedIn.data && <CurrentPlan />}
      {packages.isPending ? (
        <div aria-busy className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-lg" />
          ))}
        </div>
      ) : packages.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(packages.error)}
            retryLabel={tc('retry')}
            onRetry={() => void packages.refetch()}
          />
        </AppCard>
      ) : packages.data.length === 0 ? (
        <AppCard>
          <EmptyState title={t('empty')} />
        </AppCard>
      ) : (
        <ul className="grid gap-4 md:grid-cols-3">
          {packages.data.map((p) => (
            <li key={p.id}>
              <PlanCard p={p} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-caption text-text-muted">{t('secure')}</p>
    </div>
  );
}
