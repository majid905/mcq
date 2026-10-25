import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import type { Locale } from '@/i18n/routing';

/** Signed-in area. middleware.ts already sent guests to /login. */
export default async function StudentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale as Locale);
  return <AppShell>{children}</AppShell>;
}
