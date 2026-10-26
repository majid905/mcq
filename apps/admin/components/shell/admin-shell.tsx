'use client';

import { Avatar, ThemeToggle, cn } from '@mcq/ui';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileUp,
  Flag,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { NAV, NAV_GROUPS, type NavKey, can } from '@/lib/permissions';
import { useAdminLogout, useAdminMe } from '@/lib/queries';

const ICONS: Record<NavKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  questions: BookOpen,
  imports: FileUp,
  taxonomy: FolderTree,
  reports: Flag,
  exams: ClipboardList,
  users: Users,
  payments: CreditCard,
  packages: Package,
  coupons: Ticket,
  notifications: Megaphone,
  banners: ImageIcon,
  settings: Settings,
  admins: ShieldCheck,
};

/** docs/05 §4 admin layout: 248 px sidebar, top bar; nav shows only what the role may open. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const me = useAdminMe();
  const logout = useAdminLogout();
  const perms = me.data?.permissions;
  const items = NAV.filter((item) => can(perms, item.permission));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-md bg-primary text-on-primary"
          >
            <BarChart3 size={18} />
          </span>
          <span className="text-h3 font-bold text-text">{t('common.appName')}</span>
        </Link>
        <nav aria-label={t('nav.main')} className="flex flex-col gap-4" data-testid="admin-nav">
          {me.isPending
            ? null
            : NAV_GROUPS.map((group) => {
                const groupItems = items.filter((i) => i.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-0.5">
                    <p className="px-3 pb-1 text-overline font-semibold uppercase tracking-wide text-text-subtle">
                      {t(`nav.groups.${group}`)}
                    </p>
                    {groupItems.map(({ href, key }) => {
                      const Icon = ICONS[key];
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          key={href}
                          href={href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex h-10 items-center gap-3 rounded-md px-3 text-body-sm font-medium',
                            active
                              ? 'bg-primary-soft text-primary'
                              : 'text-text-muted hover:bg-surface-muted hover:text-text',
                          )}
                        >
                          <Icon aria-hidden size={18} strokeWidth={1.75} />
                          {t(`nav.${key}`)}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-(--mcq-z-sticky) flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4">
          <span className="text-body-sm text-text-muted lg:hidden">{t('common.appName')}</span>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <LocaleSwitcher
              target={locale === 'bn' ? 'en' : 'bn'}
              label={t('locale.switchLabel')}
              text={t('locale.switchTo')}
            />
            <ThemeToggle
              labels={{ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }}
            />
            {me.data && (
              <span className="hidden items-center gap-2 sm:flex" data-testid="admin-identity">
                <Avatar name={me.data.name ?? me.data.email ?? ''} />
                <span className="text-body-sm">
                  <span className="block font-medium text-text">{me.data.name}</span>
                  <span className="block text-caption text-text-muted">{me.data.role}</span>
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => logout.mutate()}
              aria-label={t('auth.logout')}
              className="grid size-10 place-items-center rounded-md border border-border text-text-muted hover:text-danger"
            >
              <LogOut aria-hidden size={18} />
            </button>
          </div>
        </header>
        {/* Below 1024 px the sidebar collapses into a scrolling strip. */}
        <nav
          aria-label={t('nav.main')}
          className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-2 lg:hidden"
        >
          {items.map(({ href, key }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-body-sm',
                pathname.startsWith(href) ? 'bg-primary-soft text-primary' : 'text-text-muted',
              )}
            >
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
        <main className="w-full flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
