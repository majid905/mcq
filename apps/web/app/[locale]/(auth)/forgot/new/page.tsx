import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AuthHeading } from '@/components/auth/auth-shell';
import { NewPasswordForm } from '@/components/auth/password-step';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('newPasswordTitle'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('auth');
  return (
    <>
      <AuthHeading title={t('newPasswordTitle')} />
      <Suspense>
        <NewPasswordForm />
      </Suspense>
    </>
  );
}
