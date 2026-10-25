import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LeaderboardView } from '@/components/results/leaderboard-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('leaderboard');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeaderboardView examId={id} />;
}
