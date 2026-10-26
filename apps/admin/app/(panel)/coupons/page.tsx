import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingNext } from '@/components/coming-next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('coupons') };
}

export default function Page() {
  return <ComingNext titleKey="coupons" permission="coupons.write" />;
}
