import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SolutionsView } from '@/components/results/solutions-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('solutions');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <SolutionsView attemptId={attemptId} />;
}
