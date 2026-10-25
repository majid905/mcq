import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// B2 welcome carousel: on web the landing page plays that role.
export default async function Page() {
  redirect({ href: '/', locale: await getLocale() });
}
