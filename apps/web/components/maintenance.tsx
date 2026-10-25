'use client';

import { AppButton } from '@mcq/ui';
import { Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePublicSettings } from '@/lib/queries';

/**
 * Maintenance screen (FR-APP-02). Any 503 MAINTENANCE sends the user here; settings/public is
 * always open, so this page polls it and offers the way back once maintenance ends.
 */
export function Maintenance() {
  const t = useTranslations('maintenance');
  const locale = useLocale();
  const settings = usePublicSettings(30_000);
  const m = settings.data?.maintenance;
  const over = settings.isSuccess && !m?.enabled;
  const custom = locale === 'en' ? m?.message_en : m?.message_bn;

  return (
    <div
      className="mx-auto flex max-w-110 flex-col items-center gap-4 px-4 py-20 text-center"
      aria-live="polite"
    >
      <span className="grid size-16 place-items-center rounded-pill bg-warning-soft text-warning">
        <Wrench aria-hidden size={30} strokeWidth={1.75} />
      </span>
      <h1 className="text-h1 font-bold text-text">{over ? t('overTitle') : t('title')}</h1>
      <p className="text-body text-text-muted">{over ? t('overBody') : custom || t('body')}</p>
      {over ? (
        <AppButton asChild>
          <Link href="/home">{t('back')}</Link>
        </AppButton>
      ) : (
        <AppButton
          variant="secondary"
          loading={settings.isFetching}
          onClick={() => void settings.refetch()}
        >
          {t('check')}
        </AppButton>
      )}
    </div>
  );
}
