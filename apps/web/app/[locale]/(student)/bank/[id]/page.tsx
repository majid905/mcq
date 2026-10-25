import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BankPaper } from '@/components/bank/bank-views';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('bank');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page() {
  return (
    <Suspense>
      <BankPaper />
    </Suspense>
  );
}
