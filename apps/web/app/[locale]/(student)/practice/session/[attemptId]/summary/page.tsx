import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SessionSummary } from '@/components/practice/session-summary';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('session');
  return { title: t('summaryTitle'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <SessionSummary attemptId={attemptId} />;
}
