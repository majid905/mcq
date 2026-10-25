import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';

/** Exam room: focus mode, no app shell (docs/06 D4). middleware.ts guards /room. */
export default async function RoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale((await params).locale as Locale);
  return children;
}
