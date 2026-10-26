import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingNext } from '@/components/coming-next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('banners') };
}

export default function Page() {
  return <ComingNext titleKey="banners" permission="banners.write" />;
}
