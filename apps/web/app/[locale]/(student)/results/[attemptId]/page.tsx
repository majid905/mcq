import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResultView } from '@/components/results/result-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('result');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <ResultView attemptId={attemptId} />;
}
