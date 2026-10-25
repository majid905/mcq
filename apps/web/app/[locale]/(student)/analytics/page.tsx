import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/coming-soon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('analytics') };
}

export default function Page() {
  return <ComingSoon titleKey="analytics" />;
}
