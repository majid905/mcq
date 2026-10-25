'use client';

import {
  AppButton,
  AppCard,
  AppSwitch,
  SegmentedControl,
  type ThemePreference,
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
} from '@mcq/ui';
import type { components } from '@mcq/api-client-ts';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { FormError, FormNotice } from '@/components/auth/fields';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useApi } from '@/components/providers';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { expectOk, unwrap } from '@/lib/api';
import { useErrorText } from '@/lib/hooks';
import { useUpdateMe } from '@/lib/queries';
import { useLogout } from './profile-view';

type Prefs = components['schemas']['NotificationPrefs'];

// There is no GET for notification preferences yet (contract-change request), so the toggles
// start from these defaults and every change is saved with PUT.
const DEFAULT_PREFS: Required<Prefs> = {
  exam_reminder: true,
  result: true,
  subscription: true,
  promotional: false,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h2>
      <AppCard className="flex flex-col gap-3">{children}</AppCard>
    </section>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center justify-between text-body text-text hover:text-primary"
    >
      {label}
      <ChevronRight aria-hidden size={18} className="text-text-subtle" />
    </Link>
  );
}

/** J4 Settings: language, theme, notifications, devices, legal, delete account, version. */
export function SettingsView() {
  const t = useTranslations('settings');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const api = useApi();
  const errorText = useErrorText();
  const updateMe = useUpdateMe();
  const logout = useLogout();
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => 'system' as const,
  );
  const [prefs, setPrefs] = useState<Required<Prefs>>(DEFAULT_PREFS);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const savePrefs = useMutation({
    mutationFn: (next: Prefs) => unwrap(api.PUT('/notifications/preferences', { body: next })),
    onMutate: (next) => {
      const prev = prefs;
      setPrefs({ ...prefs, ...next });
      return { prev };
    },
    onError: (_e, _n, ctx) => ctx && setPrefs(ctx.prev),
  });
  const resetDevices = useMutation({ mutationFn: () => expectOk(api.POST('/me/devices/reset')) });
  const deleteAccount = useMutation({
    mutationFn: () => expectOk(api.DELETE('/me')),
    onSuccess: () => logout.mutate(),
  });

  const setLanguage = (next: Locale) => {
    updateMe.mutate({ locale: next });
    router.replace(pathname, { locale: next });
  };
  const setTheme = (next: ThemePreference) => {
    applyThemePreference(next);
    updateMe.mutate({ theme: next });
  };

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-6">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>

      <Section title={t('appearance')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-text">{t('language')}</span>
          <SegmentedControl
            label={t('language')}
            value={locale}
            onValueChange={setLanguage}
            options={[
              { value: 'bn', label: 'বাংলা' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-text">{t('theme')}</span>
          <SegmentedControl
            label={t('theme')}
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: 'system', label: t('themeSystem') },
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') },
            ]}
          />
        </div>
      </Section>

      <Section title={t('notifications')}>
        {(Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]).map((key) => (
          <AppSwitch
            key={key}
            label={t(`notify.${key}`)}
            checked={prefs[key]}
            disabled={savePrefs.isPending}
            onCheckedChange={(on) => savePrefs.mutate({ ...prefs, [key]: on })}
          />
        ))}
        <FormError message={savePrefs.isError ? errorText(savePrefs.error) : null} />
      </Section>

      <Section title={t('devices')}>
        <p className="text-body-sm text-text-muted">{t('devicesBody')}</p>
        <AppButton
          variant="secondary"
          size="sm"
          className="self-start"
          loading={resetDevices.isPending}
          onClick={() => resetDevices.mutate()}
        >
          {t('signOutOthers')}
        </AppButton>
        <FormNotice message={resetDevices.isSuccess ? t('signedOutOthers') : null} />
        <FormError message={resetDevices.isError ? errorText(resetDevices.error) : null} />
      </Section>

      <Section title={t('about')}>
        <LinkRow href="/privacy" label={t('privacy')} />
        <LinkRow href="/terms" label={t('terms')} />
        <div className="flex min-h-11 items-center justify-between text-body text-text">
          {t('version')}
          <span className="text-text-muted">{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</span>
        </div>
      </Section>

      <Section title={t('dangerZone')}>
        <p className="text-body-sm text-text-muted">{t('deleteBody')}</p>
        <AppButton
          variant="danger"
          size="sm"
          className="self-start"
          onClick={() => setConfirmDelete(true)}
        >
          {t('deleteAccount')}
        </AppButton>
        <FormError message={deleteAccount.isError ? errorText(deleteAccount.error) : null} />
      </Section>

      <ConfirmDialog
        open={confirmDelete}
        title={t('deleteConfirmTitle')}
        body={t('deleteConfirmBody')}
        confirmLabel={t('deleteAccount')}
        cancelLabel={t('cancel')}
        danger
        loading={deleteAccount.isPending}
        onConfirm={() => deleteAccount.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
