import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { HistoryView } from '@/components/results/history-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('history');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  return <HistoryView />;
}
