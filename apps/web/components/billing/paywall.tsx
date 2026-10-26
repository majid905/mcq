'use client';

import { AppButton } from '@mcq/ui';
import { Crown, Hourglass } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';

export interface PaywallState {
  code: 'PREMIUM_REQUIRED' | 'QUOTA_EXHAUSTED';
  details: Record<string, unknown>;
}

/**
 * Shared paywall (docs/05 PremiumLock as a dialog). Opened by the API client for any 402
 * PREMIUM_REQUIRED / QUOTA_EXHAUSTED, so every screen gets the same upsell.
 */
export function Paywall({ state, onClose }: { state: PaywallState | null; onClose: () => void }) {
  const t = useTranslations('paywall');
  const format = useFormatter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (state && !d.open) d.showModal();
    if (!state && d.open) d.close();
  }, [state]);

  const quota = state?.code === 'QUOTA_EXHAUSTED';
  const resetsAt =
    typeof state?.details.resets_at === 'string' ? new Date(state.details.resets_at) : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="paywall-title"
      data-testid="paywall"
      className="m-auto w-[min(92vw,420px)] rounded-xl border border-border bg-surface p-6 text-center text-text shadow-lg backdrop:bg-overlay"
    >
      <span className="mx-auto grid size-14 place-items-center rounded-pill bg-accent text-on-accent">
        {quota ? <Hourglass aria-hidden size={26} /> : <Crown aria-hidden size={26} />}
      </span>
      <h2 id="paywall-title" className="mt-4 text-h2 font-semibold">
        {quota ? t('quotaTitle') : t('premiumTitle')}
      </h2>
      <p className="mt-2 text-body text-text-muted">
        {quota && resetsAt
          ? t('quotaBody', {
              time: format.dateTime(resetsAt, {
                weekday: 'long',
                hour: 'numeric',
                minute: '2-digit',
              }),
            })
          : t('premiumBody')}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <AppButton asChild fullWidth>
          <Link href="/plans" onClick={onClose}>
            {t('seePlans')}
          </Link>
        </AppButton>
        <AppButton variant="ghost" fullWidth onClick={onClose}>
          {t('later')}
        </AppButton>
      </div>
    </dialog>
  );
}
