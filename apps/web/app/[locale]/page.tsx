import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ApiStatus } from '@/components/api-status';
import { SiteHeader } from '@/components/site-header';
import type { Locale } from '@/i18n/routing';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // The layout has already rejected unknown locales with notFound().
  setRequestLocale(locale as Locale);
  const t = await getTranslations('home');

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-reading flex-col gap-6 px-4 py-10">
        <div>
          <h1 className="text-h1 font-bold">{t('title')}</h1>
          <p className="mt-2 text-body text-text-muted">{t('subtitle')}</p>
        </div>
        <ApiStatus />
      </main>
    </>
  );
}
