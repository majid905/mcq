import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

const PAGES = ['about', 'contact', 'privacy', 'terms', 'refund'] as const;
type PageKey = (typeof PAGES)[number];

interface Section {
  h: string;
  p: string;
}

const isPageKey = (value: string): value is PageKey => (PAGES as readonly string[]).includes(value);

export const dynamicParams = false;

export function generateStaticParams() {
  return PAGES.map((page) => ({ page }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  if (!isPageKey(page)) return {};
  const t = await getTranslations('staticPages');
  return { title: t(`${page}.title`), description: t(`${page}.description`) };
}

/** Footer pages: about, contact, privacy, terms, refund. Plain text from messages/*.json. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; page: string }>;
}) {
  const { locale, page } = await params;
  if (!isPageKey(page)) notFound();
  setRequestLocale(locale as Locale);
  const t = await getTranslations('staticPages');
  const sections = t.raw(`${page}.sections`) as Section[];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-h1 text-text">{t(`${page}.title`)}</h1>
      <p className="mt-2 text-body text-text-subtle">{t(`${page}.description`)}</p>
      <div className="mt-8 flex flex-col gap-7">
        {sections.map((section) => (
          <section key={section.h}>
            <h2 className="text-h3 text-text">{section.h}</h2>
            <p className="mt-2 text-body text-text-muted">{section.p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
