import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SearchView } from '@/components/search/search-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('search'), robots: { index: false } };
}

export default async function Page() {
  return <SearchView />;
}
