import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AnalyticsView } from '@/components/analytics/analytics-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('analytics'), robots: { index: false } };
}

export default async function Page() {
  return <AnalyticsView />;
}
