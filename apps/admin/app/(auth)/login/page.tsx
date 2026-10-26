import { ThemeToggle } from '@mcq/ui';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AdminLogin } from '@/components/auth/admin-login';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('title') };
}

export default async function LoginPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-end gap-2 px-4">
        <LocaleSwitcher
          target={locale === 'bn' ? 'en' : 'bn'}
          label={t('locale.switchLabel')}
          text={t('locale.switchTo')}
        />
        <ThemeToggle
          labels={{ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }}
        />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-10">
        <div className="w-full max-w-100 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-h1 font-bold text-text">{t('login.title')}</h1>
          <p className="mb-6 mt-1 text-body-sm text-text-muted">{t('login.subtitle')}</p>
          <Suspense>
            <AdminLogin />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
