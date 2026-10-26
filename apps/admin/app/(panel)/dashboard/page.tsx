import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DashboardView } from '@/components/dashboard/dashboard-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('dashboard') };
}

export default function Page() {
  return <DashboardView />;
}
