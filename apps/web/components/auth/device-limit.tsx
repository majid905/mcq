'use client';

import { AppButton, AppCard } from '@mcq/ui';
import { MonitorSmartphone, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePublicSettings } from '@/lib/queries';

/**
 * One active browser per account: logging in here signs the other device out, so the way back
 * is simply to log in again (the API's self device reset needs a session, which is gone here).
 */
export function DeviceLimit() {
  const t = useTranslations('auth');
  const settings = usePublicSettings();
  const support = settings.data?.support_phone;
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="grid size-16 place-items-center rounded-pill bg-accent-soft text-accent-text">
        <MonitorSmartphone aria-hidden size={32} strokeWidth={1.75} />
      </span>
      <h1 className="text-h1 font-bold text-text">{t('deviceLimitTitle')}</h1>
      <p className="text-body text-text-muted">{t('deviceLimitBody')}</p>
      <AppButton asChild fullWidth>
        <Link href="/login">{t('useThisDevice')}</Link>
      </AppButton>
      {support && (
        <AppCard className="flex w-full items-center gap-3 text-left">
          <Phone aria-hidden size={20} className="text-primary" />
          <div>
            <div className="text-body-sm text-text-muted">{t('supportLabel')}</div>
            <a
              href={`tel:${support}`}
              className="text-body font-semibold text-text hover:underline"
            >
              {support}
            </a>
          </div>
        </AppCard>
      )}
    </div>
  );
}
