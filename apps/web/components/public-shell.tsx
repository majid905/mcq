import { AppButton } from '@mcq/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { HeaderControls } from '@/components/header-controls';
import { Link } from '@/i18n/navigation';

const FOOTER_LINKS = ['about', 'contact', 'privacy', 'terms', 'refund'] as const;

export async function PublicShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--mcq-z-sticky) border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-3 px-4">
          <Link href="/" aria-label={t('common.appName')}>
            <Brand name={t('common.appName')} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <HeaderControls compact />
            </div>
            <AppButton asChild variant="ghost" size="sm">
              <Link href="/login">{t('auth.login')}</Link>
            </AppButton>
            <AppButton asChild size="sm" className="max-sm:hidden">
              <Link href="/register">{t('landing.ctaStart')}</Link>
            </AppButton>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-text-muted">
            © {new Date().getFullYear()} {t('common.appName')}
          </p>
          <nav aria-label={t('landing.footerNav')} className="flex flex-wrap gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((key) => (
              <Link
                key={key}
                href={`/${key}`}
                className="text-body-sm text-text-muted hover:text-text"
              >
                {t(`landing.footer.${key}`)}
              </Link>
            ))}
          </nav>
          <div className="sm:hidden">
            <HeaderControls />
          </div>
        </div>
      </footer>
    </div>
  );
}
