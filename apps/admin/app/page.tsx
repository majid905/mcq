import { getTranslations } from 'next-intl/server';
import { ApiStatus } from '@/components/api-status';
import { SiteHeader } from '@/components/site-header';

export default async function AdminHomePage() {
  const t = await getTranslations('home');

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-content flex-col gap-6 px-6 py-8">
        <div>
          <h1 className="text-h1 font-bold">{t('title')}</h1>
          <p className="mt-2 text-body text-text-muted">{t('subtitle')}</p>
        </div>
        <div className="max-w-reading">
          <ApiStatus />
        </div>
      </main>
    </>
  );
}
