import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaymentHistory } from '@/components/billing/payment-status';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payment');
  return { title: t('historyTitle'), robots: { index: false } };
}

export default async function Page() {
  return <PaymentHistory />;
}
