import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HomeFeed } from '@/components/home/home-feed';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('home') };
}

export default function Page() {
  return <HomeFeed />;
}
