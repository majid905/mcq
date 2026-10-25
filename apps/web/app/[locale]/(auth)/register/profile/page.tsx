import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { RegisterProfileForm } from '@/components/auth/password-step';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('profileTitle'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthHeading title={t('profileTitle')} subtitle={t('profileSubtitle')} />
      <Suspense>
        <RegisterProfileForm />
      </Suspense>
    </>
  );
}
