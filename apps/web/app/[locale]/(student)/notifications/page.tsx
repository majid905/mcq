import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Inbox } from '@/components/notifications/inbox';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('notifications'), robots: { index: false } };
}

export default async function Page() {
  return <Inbox />;
}
