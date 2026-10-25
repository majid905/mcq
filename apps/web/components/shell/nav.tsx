'use client';

import { Avatar, cn } from '@mcq/ui';
import { BarChart3, Clock, House, NotebookPen, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useCategories, useMe } from '@/lib/queries';

/** docs/06 A: হোম · পরীক্ষা · প্র্যাকটিস · অ্যানালিটিক্স · প্রোফাইল. */
export const NAV_ITEMS = [
  { href: '/home', key: 'home', icon: House },
  { href: '/exams', key: 'exams', icon: Clock },
  { href: '/practice', key: 'practice', icon: NotebookPen },
  { href: '/analytics', key: 'analytics', icon: BarChart3 },
  { href: '/profile', key: 'profile', icon: UserRound },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const t = useTranslations('nav');
  const isActive = useActive();
  return (
    <nav aria-label={t('main')} className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
        const active = isActive(href) || (href === '/profile' && isActive('/settings'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-md px-3 text-body font-medium transition-colors duration-(--mcq-duration-fast)',
              active
                ? 'bg-primary-soft text-primary'
                : 'text-text-muted hover:bg-surface-muted hover:text-text',
            )}
          >
            <Icon aria-hidden size={20} strokeWidth={1.75} />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Between 768 and 1023 px the nav sits in the top bar. */
export function TopNav() {
  const t = useTranslations('nav');
  const isActive = useActive();
  return (
    <nav aria-label={t('main')} className="hidden items-center gap-1 md:flex lg:hidden">
      {NAV_ITEMS.slice(0, 4).map(({ href, key }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-2 text-body-sm font-medium',
            isActive(href) ? 'bg-primary-soft text-primary' : 'text-text-muted hover:text-text',
          )}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const t = useTranslations('nav');
  const isActive = useActive();
  return (
    <nav
      aria-label={t('main')}
      className="fixed inset-x-0 bottom-0 z-(--mcq-z-sticky) flex h-17 items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
        const active = isActive(href) || (href === '/profile' && isActive('/settings'));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-12 flex-1 flex-col items-center justify-center gap-1 text-overline',
              active ? 'font-semibold text-primary' : 'text-text-subtle',
            )}
          >
            <Icon aria-hidden size={22} strokeWidth={active ? 2.25 : 1.75} />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function MeAvatarLink() {
  const t = useTranslations('nav');
  const me = useMe();
  return (
    <Link
      href="/profile"
      aria-label={t('profile')}
      className="rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Avatar name={me.data?.name ?? ''} src={me.data?.avatar_url} />
    </Link>
  );
}

/** New accounts without goals finish onboarding first (B7). */
export function OnboardingGuard() {
  const me = useMe();
  const categories = useCategories();
  const router = useRouter();
  // Only when there is something to pick: without GET /taxonomy the user would be stuck.
  const needsGoals =
    me.data &&
    (me.data.target_node_ids ?? []).length === 0 &&
    categories.isSuccess &&
    categories.data.length > 0;
  useEffect(() => {
    if (needsGoals) router.replace('/onboarding/goals');
  }, [needsGoals, router]);
  return null;
}
