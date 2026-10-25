import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ExamRoom } from '@/components/exam-room/exam-room';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('room');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return (
    <Suspense>
      <ExamRoom attemptId={attemptId} />
    </Suspense>
  );
}
