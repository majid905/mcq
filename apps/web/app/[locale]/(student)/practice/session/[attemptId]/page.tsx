import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuickSession } from '@/components/practice/quick-session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('session');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <QuickSession attemptId={attemptId} />;
}
