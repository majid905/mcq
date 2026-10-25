import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuestionList } from '@/components/questions/question-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lists');
  return { title: t('wrongTitle'), robots: { index: false } };
}

export default async function Page() {
  return <QuestionList kind="wrong" />;
}
