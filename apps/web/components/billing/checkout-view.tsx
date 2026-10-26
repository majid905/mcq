'use client';

import { AppButton, AppCard, AppTextField, EmptyState, Skeleton, cn, formatDecimal } from '@mcq/ui';
import { CreditCard, Smartphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError, FormNotice } from '@/components/auth/fields';
import { Link } from '@/i18n/navigation';
import { type Gateway, useCheckout, usePackages, useValidateCoupon } from '@/lib/billing/queries';
import { useErrorText } from '@/lib/hooks';

const GATEWAYS: { id: Gateway; icon: typeof Smartphone }[] = [
  { id: 'bkash', icon: Smartphone },
  { id: 'sslcommerz', icon: CreditCard },
];

/** I2 Checkout (FR-PAY-02, 03): summary, coupon, method, then the gateway page. */
export function CheckoutView({ packageId }: { packageId: string }) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const errorText = useErrorText();
  const groupId = useId();
  const packages = usePackages();
  const validate = useValidateCoupon();
  const checkout = useCheckout();
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{
    code: string;
    discount: number;
    payable: number;
  } | null>(null);
  const [gateway, setGateway] = useState<Gateway>('bkash');
  const money = (v: number) => `৳${formatDecimal(v, locale, 0)}`;

  if (packages.isPending)
    return <Skeleton aria-busy className="mx-auto h-96 max-w-reading rounded-lg" />;
  const pkg = packages.data?.find((p) => p.id === packageId);
  if (!pkg) {
    return (
      <AppCard className="mx-auto max-w-reading">
        <EmptyState
          title={t('notFound')}
          action={
            <AppButton asChild size="sm">
              <Link href="/plans">{t('backToPlans')}</Link>
            </AppButton>
          }
        />
      </AppCard>
    );
  }

  const price = pkg.price_bdt ?? 0;
  const total = applied ? applied.payable : price;

  const applyCoupon = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    validate.mutate(
      { code, packageId },
      {
        onSuccess: (r) =>
          setApplied({
            code: code.trim(),
            discount: r.discount_bdt ?? 0,
            payable: r.payable_bdt ?? price,
          }),
        onError: () => setApplied(null),
      },
    );
  };

  const pay = () =>
    checkout.mutate(
      { packageId, gateway, coupon: applied?.code },
      {
        onSuccess: (r) => {
          // The subscription starts only after the server validates the payment (FR-PAY-02);
          // the gateway sends the user back to /payment/{id}/status.
          if (r.redirect_url && /^https:\/\//.test(r.redirect_url))
            window.location.assign(r.redirect_url);
        },
      },
    );

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <AppCard className="flex flex-col gap-2" data-testid="order-summary">
        <h2 className="text-h3 font-semibold text-text">{pkg.name}</h2>
        <div className="flex justify-between text-body text-text">
          <span>{t('price')}</span>
          <span className="tabular-nums">{money(price)}</span>
        </div>
        {applied && (
          <div className="flex justify-between text-body text-success">
            <span>{t('discount', { code: applied.code })}</span>
            <span className="tabular-nums">−{money(applied.discount)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-border pt-2 text-h3 font-semibold text-text">
          <span>{t('total')}</span>
          <span className="tabular-nums" data-testid="total">
            {money(total)}
          </span>
        </div>
      </AppCard>

      <AppCard>
        <form onSubmit={applyCoupon} className="flex items-end gap-2">
          <AppTextField
            className="flex-1"
            label={t('coupon')}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            error={validate.isError ? errorText(validate.error) : undefined}
          />
          <AppButton
            type="submit"
            variant="secondary"
            loading={validate.isPending}
            disabled={!code.trim()}
            className="mb-0.5"
          >
            {t('apply')}
          </AppButton>
        </form>
        <FormNotice message={applied ? t('couponApplied') : null} />
      </AppCard>

      <AppCard>
        <h2 id={groupId} className="text-h3 font-semibold text-text">
          {t('method')}
        </h2>
        <div role="radiogroup" aria-labelledby={groupId} className="mt-3 flex flex-col gap-2">
          {GATEWAYS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={gateway === id}
              onClick={() => setGateway(id)}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-md border-[1.5px] px-4 text-left',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                gateway === id
                  ? 'border-primary bg-primary-soft'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <Icon aria-hidden size={22} className="text-primary" />
              <span className="flex-1">
                <span className="block text-body font-medium text-text">
                  {t(`gateways.${id}.name`)}
                </span>
                <span className="block text-caption text-text-muted">
                  {t(`gateways.${id}.hint`)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </AppCard>

      <FormError message={checkout.isError ? errorText(checkout.error) : null} />
      <AppButton fullWidth loading={checkout.isPending || checkout.isSuccess} onClick={pay}>
        {t('pay', { total: money(total) })}
      </AppButton>
      <p className="text-center text-caption text-text-muted">{t('redirectNote')}</p>
    </div>
  );
}
