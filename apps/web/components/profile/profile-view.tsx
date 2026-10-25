'use client';

import { AppButton, AppCard, Avatar, ErrorState, Skeleton, formatInteger } from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronRight,
  ClipboardList,
  Crown,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Pencil,
  Receipt,
  Settings,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/components/providers';
import { Link, getPathname } from '@/i18n/navigation';
import { expectOk } from '@/lib/api';
import { districtName } from '@/lib/districts';
import { useErrorText } from '@/lib/hooks';
import { useMe } from '@/lib/queries';

const MENU: {
  href: string;
  key: 'myExams' | 'payments' | 'bookmarks' | 'settings' | 'help';
  icon: LucideIcon;
}[] = [
  { href: '/history', key: 'myExams', icon: ClipboardList },
  { href: '/payments', key: 'payments', icon: Receipt },
  { href: '/bookmarks', key: 'bookmarks', icon: Bookmark },
  { href: '/settings', key: 'settings', icon: Settings },
  { href: '/contact', key: 'help', icon: LifeBuoy },
];

export function useLogout() {
  const api = useApi();
  const locale = useLocale();
  return useMutation({
    // The BFF clears the cookies even if the API call fails.
    mutationFn: () => expectOk(api.POST('/auth/logout')).catch(() => undefined),
    // Full navigation: drops every cached query, so nothing refetches with a dead session.
    onSettled: () => window.location.assign(getPathname({ href: '/login', locale })),
  });
}

/** J2 Profile. */
export function ProfileView() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const me = useMe();
  const logout = useLogout();

  if (me.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <AppCard>
        <ErrorState
          message={errorText(me.error)}
          retryLabel={tc('retry')}
          onRetry={() => void me.refetch()}
        />
      </AppCard>
    );
  }

  const user = me.data;
  const sub = user.subscription;
  const phone = (user.phone ?? '').replace(/\d/g, (d) => formatInteger(Number(d), locale));
  const district = districtName(user.district_id, locale);

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <AppCard className="flex items-center gap-4">
        <Avatar name={user.name ?? ''} src={user.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2 font-semibold text-text">{user.name}</h2>
          <p className="text-body-sm text-text-muted">{phone}</p>
          {district && <p className="text-body-sm text-text-muted">{district}</p>}
        </div>
        <AppButton asChild variant="secondary" size="sm" aria-label={t('edit')}>
          <Link href="/profile/edit">
            <Pencil aria-hidden size={16} />
            <span className="max-sm:sr-only">{t('edit')}</span>
          </Link>
        </AppButton>
      </AppCard>

      <AppCard
        className="flex items-center gap-4 bg-accent-soft border-accent-soft"
        data-testid="plan-card"
      >
        <span className="grid size-11 flex-none place-items-center rounded-md bg-accent text-on-accent">
          <Crown aria-hidden size={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-text">
            {sub?.is_premium ? t('premiumPlan') : t('freePlan')}
          </p>
          <p className="text-body-sm text-text-muted">
            {sub?.is_premium && sub.ends_at
              ? t('expires', {
                  date: format.dateTime(new Date(sub.ends_at), { dateStyle: 'medium' }),
                })
              : sub?.trial_available
                ? t('trialAvailable')
                : t('freeBody')}
          </p>
        </div>
        <AppButton asChild size="sm">
          <Link href="/plans">{sub?.is_premium ? t('renew') : t('upgrade')}</Link>
        </AppButton>
      </AppCard>

      <AppCard className="p-0">
        <nav aria-label={t('menu')}>
          <ul>
            {MENU.map(({ href, key, icon: Icon }) => (
              <li key={href} className="border-b border-border last:border-b-0">
                <Link
                  href={href}
                  className="flex min-h-13 items-center gap-3 px-4 text-body text-text hover:bg-surface-muted"
                >
                  <Icon aria-hidden size={20} strokeWidth={1.75} className="text-text-muted" />
                  <span className="flex-1">{t(`menuItems.${key}`)}</span>
                  <ChevronRight aria-hidden size={18} className="text-text-subtle" />
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="flex min-h-13 w-full items-center gap-3 px-4 text-left text-body text-danger hover:bg-danger-soft"
              >
                <LogOut aria-hidden size={20} strokeWidth={1.75} />
                {t('logout')}
              </button>
            </li>
          </ul>
        </nav>
      </AppCard>
    </div>
  );
}
