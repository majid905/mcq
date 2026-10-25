import { Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { HeaderControls } from '@/components/header-controls';
import { Link } from '@/i18n/navigation';
import { BellLink, BottomNav, MeAvatarLink, OnboardingGuard, SidebarNav, TopNav } from './nav';

const iconLink =
  'grid size-10 place-items-center rounded-md border border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text';

/** docs/06 A: top bar, sidebar ≥ 1024 px, bottom nav < 768 px. */
export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <OnboardingGuard />
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface px-4 py-5 lg:flex">
        <Link href="/home" aria-label={t('common.appName')}>
          <Brand name={t('common.appName')} />
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-(--mcq-z-sticky) border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-4">
              <Link href="/home" aria-label={t('common.appName')} className="lg:hidden">
                <Brand name={t('common.appName')} className="max-sm:[&>span:last-child]:sr-only" />
              </Link>
              <TopNav />
            </div>
            <div className="flex items-center gap-2">
              <Link href="/search" aria-label={t('nav.search')} className={iconLink}>
                <Search aria-hidden size={20} strokeWidth={1.75} />
              </Link>
              <BellLink label={t('nav.notifications')} className={iconLink} />
              <div className="hidden sm:block">
                <HeaderControls compact />
              </div>
              <MeAvatarLink />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-content flex-1 px-4 pt-5 pb-24 md:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
