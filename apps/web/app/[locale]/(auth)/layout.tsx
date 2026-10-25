import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import type { Locale } from '@/i18n/routing';

export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale as Locale);
  return <AuthShell>{children}</AuthShell>;
}
