import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomBuilder } from '@/components/practice/custom-builder';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('custom');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  return <CustomBuilder />;
}
