import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ExamDetailView } from '@/components/exams/exam-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exams');
  return { title: t('detailTitle'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamDetailView id={id} />;
}
