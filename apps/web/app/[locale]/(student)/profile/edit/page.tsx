import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileEdit } from '@/components/profile/profile-edit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('profile');
  return { title: t('editTitle') };
}

export default async function Page() {
  const t = await getTranslations('profile');
  return (
    <div className="mx-auto max-w-reading">
      <h1 className="mb-5 text-h1 font-bold text-text">{t('editTitle')}</h1>
      <ProfileEdit />
    </div>
  );
}
