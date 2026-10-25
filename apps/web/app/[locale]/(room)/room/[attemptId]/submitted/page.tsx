import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Submitted } from '@/components/results/submitted';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('submitted');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return (
    <Suspense>
      <Submitted attemptId={attemptId} />
    </Suspense>
  );
}
