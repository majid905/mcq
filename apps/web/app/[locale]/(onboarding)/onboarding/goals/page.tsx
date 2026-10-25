import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthHeading } from '@/components/auth/auth-shell';
import { GoalsStep } from '@/components/onboarding/goals-step';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('goalsTitle'), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations('onboarding');
  return (
    <>
      <p className="mb-2 text-caption font-semibold text-primary">
        {t('step', { current: 1, total: 2 })}
      </p>
      <AuthHeading title={t('goalsTitle')} subtitle={t('goalsSubtitle')} />
      <GoalsStep />
    </>
  );
}
