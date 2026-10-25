import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DeviceLimit } from '@/components/auth/device-limit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('deviceLimitTitle'), robots: { index: false } };
}

/** B10 Signed out because the account was opened on another device (FR-AUTH-07). */
export default function Page() {
  return <DeviceLimit />;
}
