import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { HeaderControls } from '@/components/header-controls';
import { Link } from '@/i18n/navigation';

/** Centered single column for auth and onboarding screens (mobile layout on every width). */
export async function AuthShell({ children }: { children: ReactNode }) {
  const t = await getTranslations('common');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" aria-label={t('appName')}>
          <Brand name={t('appName')} />
        </Link>
        <HeaderControls compact />
      </header>
      <main className="flex flex-1 justify-center px-4 pb-12 pt-4 sm:pt-10">
        <div className="w-full max-w-110">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-h1 font-bold text-text">{title}</h1>
      {subtitle && <p className="mt-2 text-body text-text-muted">{subtitle}</p>}
    </div>
  );
}
