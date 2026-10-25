import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { PhoneStep } from '@/components/auth/phone-step';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('forgotTitle'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthHeading title={t('forgotTitle')} subtitle={t('forgotSubtitle')} />
      <Suspense>
        <PhoneStep purpose="reset_password" />
      </Suspense>
    </>
  );
}
