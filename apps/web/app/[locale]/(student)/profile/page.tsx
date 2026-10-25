import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/components/profile/profile-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return { title: t('title') };
}

export default async function Page() {
  const t = await getTranslations('profile');
  return (
    <div className="mx-auto max-w-reading">
      <h1 className="sr-only">{t('title')}</h1>
      <ProfileView />
    </div>
  );
}
