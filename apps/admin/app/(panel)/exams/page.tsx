import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingNext } from '@/components/coming-next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('exams') };
}

export default function Page() {
  return <ComingNext titleKey="exams" permission="exams.read" />;
}
