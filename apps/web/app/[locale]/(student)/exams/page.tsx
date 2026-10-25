import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ExamList } from '@/components/exams/exam-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exams');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  return (
    <Suspense>
      <ExamList />
    </Suspense>
  );
}
