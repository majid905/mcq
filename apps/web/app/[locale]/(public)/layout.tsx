import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PublicShell } from '@/components/public-shell';
import type { Locale } from '@/i18n/routing';

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale as Locale);
  return <PublicShell>{children}</PublicShell>;
}
