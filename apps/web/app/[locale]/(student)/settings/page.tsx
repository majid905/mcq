import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsView } from '@/components/profile/settings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default function Page() {
  return (
    <div className="mx-auto max-w-reading">
      <SettingsView />
    </div>
  );
}
