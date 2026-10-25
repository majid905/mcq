import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PracticeNode } from '@/components/practice/practice-node';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('practice');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PracticeNode id={id} />;
}
