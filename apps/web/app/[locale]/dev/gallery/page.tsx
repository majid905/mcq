import { ComponentGallery, type GalleryMessages, ThemeToggle } from '@mcq/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import type { Locale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'UI gallery', robots: { index: false } };

// Dev tool: hidden in production builds unless NEXT_PUBLIC_SHOW_GALLERY=1.
const enabled =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_GALLERY === '1';

export default async function GalleryPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!enabled) notFound();
  const { locale } = await params;
  // The layout has already rejected unknown locales with notFound().
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  const messages = await getMessages();

  return (
    <ComponentGallery
      locale={locale}
      messages={messages.gallery satisfies GalleryMessages}
      toolbar={
        <>
          <LocaleSwitcher
            target={locale === 'bn' ? 'en' : 'bn'}
            label={t('locale.switchLabel')}
            text={t('locale.switchTo')}
          />
          <ThemeToggle
            labels={{ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }}
          />
        </>
      }
    />
  );
}
