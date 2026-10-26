import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PaymentStatus } from '@/components/billing/payment-status';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payment');
  return { title: t('statusTitle'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PaymentStatus paymentId={paymentId} />;
}
