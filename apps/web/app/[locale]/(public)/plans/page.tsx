import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PlansView } from '@/components/billing/plans-view';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plans');
  return { title: t('title'), description: t('subtitle') };
}

/** I1 / K /plans: public, so guests can compare packages before signing up. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale as Locale);
  return <PlansView />;
}
