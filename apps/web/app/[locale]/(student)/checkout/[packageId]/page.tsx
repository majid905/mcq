import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckoutView } from '@/components/billing/checkout-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('checkout');
  return { title: t('title'), robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ packageId: string }> }) {
  const { packageId } = await params;
  return <CheckoutView packageId={packageId} />;
}
