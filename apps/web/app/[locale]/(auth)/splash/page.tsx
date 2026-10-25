import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// B1 splash: on web middleware restores the session; signed-out users land on /login.
export default async function Page() {
  redirect({ href: '/home', locale: await getLocale() });
}
