'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  EmptyState,
  ErrorState,
  Skeleton,
  formatDecimal,
} from '@mcq/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { type Payment, usePayment, usePaymentHistory } from '@/lib/billing/queries';
import { useErrorText } from '@/lib/hooks';
import { queryKeys, useMe } from '@/lib/queries';

/** I3 Payment result (FR-PAY-02): polls until the server has validated with the gateway. */
export function PaymentStatus({ paymentId }: { paymentId: string }) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const format = useFormatter();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const payment = usePayment(paymentId);
  const me = useMe();
  const status = payment.data?.status;

  // A paid payment changes the plan: reload /me so the profile and paywalls see it.
  useEffect(() => {
    if (status === 'paid') void qc.invalidateQueries({ queryKey: queryKeys.me });
  }, [status, qc]);

  if (payment.isPending)
    return <Skeleton aria-busy className="mx-auto h-72 max-w-110 rounded-lg" />;
  if (payment.isError) {
    return (
      <AppCard className="mx-auto max-w-110">
        <ErrorState
          message={errorText(payment.error)}
          retryLabel={tc('retry')}
          onRetry={() => void payment.refetch()}
        />
      </AppCard>
    );
  }

  const endsAt = me.data?.subscription?.ends_at;
  const stillWaiting = !payment.isFetching && (status === 'initiated' || status === 'pending');

  return (
    <div
      className="mx-auto flex max-w-110 flex-col items-center gap-4 px-4 py-12 text-center"
      aria-live="polite"
      data-testid="payment-status"
      data-status={status}
    >
      {status === 'paid' ? (
        <>
          <span className="grid size-20 place-items-center rounded-pill bg-success-soft text-success motion-safe:animate-[mcq-badge-pop_var(--mcq-duration-slow)_var(--mcq-easing-emphasized)]">
            <CheckCircle2 aria-hidden size={44} strokeWidth={1.75} />
          </span>
          <h1 className="text-h1 font-bold text-text">{t('paidTitle')}</h1>
          <p className="text-body text-text-muted">
            {endsAt
              ? t('paidUntil', { date: format.dateTime(new Date(endsAt), { dateStyle: 'long' }) })
              : t('paidBody')}
          </p>
          <AppButton asChild>
            <Link href="/home">{t('start')}</Link>
          </AppButton>
        </>
      ) : status === 'failed' || status === 'cancelled' ? (
        <>
          <span className="grid size-20 place-items-center rounded-pill bg-danger-soft text-danger">
            <XCircle aria-hidden size={44} strokeWidth={1.75} />
          </span>
          <h1 className="text-h1 font-bold text-text">
            {status === 'cancelled' ? t('cancelledTitle') : t('failedTitle')}
          </h1>
          <p className="text-body text-text-muted">{t('failedBody')}</p>
          <AppButton asChild>
            <Link href="/plans">{t('retry')}</Link>
          </AppButton>
        </>
      ) : (
        <>
          <LoaderCircle aria-hidden size={48} className="text-primary motion-safe:animate-spin" />
          <h1 className="text-h1 font-bold text-text">{t('pendingTitle')}</h1>
          <p className="text-body text-text-muted">{t('pendingBody')}</p>
          {stillWaiting && (
            <AppButton variant="secondary" onClick={() => void payment.refetch()}>
              {t('checkAgain')}
            </AppButton>
          )}
        </>
      )}
    </div>
  );
}

const STATUS_VARIANT: Record<
  NonNullable<Payment['status']>,
  'success' | 'danger' | 'soft' | 'accent'
> = {
  paid: 'success',
  failed: 'danger',
  cancelled: 'soft',
  refunded: 'accent',
  initiated: 'soft',
  pending: 'accent',
};

/** I4 Payment history (FR-PAY-05). */
export function PaymentHistory() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const history = usePaymentHistory();

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t('historyTitle')}</h1>
      {history.isPending ? (
        <Skeleton aria-busy className="h-48 rounded-lg" />
      ) : history.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(history.error)}
            retryLabel={tc('retry')}
            onRetry={() => void history.refetch()}
          />
        </AppCard>
      ) : history.data.length === 0 ? (
        <AppCard>
          <EmptyState
            title={t('historyEmpty')}
            action={
              <AppButton asChild size="sm">
                <Link href="/plans">{t('seePlans')}</Link>
              </AppButton>
            }
          />
        </AppCard>
      ) : (
        <AppCard className="p-0">
          <ul className="divide-y divide-border">
            {history.data.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-4 py-3"
                data-testid="payment-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-text">{p.package_name}</p>
                  <p className="text-caption text-text-muted">
                    {p.created_at &&
                      format.dateTime(new Date(p.created_at), { dateStyle: 'medium' })}
                    {p.gateway &&
                      ` · ${t(`gatewayName.${p.gateway === 'bkash' ? 'bkash' : 'sslcommerz'}`)}`}
                    {p.gateway_tran_id && ` · ${p.gateway_tran_id}`}
                  </p>
                </div>
                <span className="text-body font-semibold tabular-nums text-text">
                  ৳{formatDecimal(p.amount_bdt ?? 0, locale, 0)}
                </span>
                {p.status && (
                  <AppChip variant={STATUS_VARIANT[p.status]}>{t(`status.${p.status}`)}</AppChip>
                )}
              </li>
            ))}
          </ul>
        </AppCard>
      )}
    </div>
  );
}
