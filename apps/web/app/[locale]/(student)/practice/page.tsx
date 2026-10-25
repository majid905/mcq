import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { PracticeHub } from '@/components/practice/practice-hub';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('practice');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  return (
    <Suspense>
      <PracticeHub />
    </Suspense>
  );
}
