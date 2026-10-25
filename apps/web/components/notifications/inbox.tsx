'use client';

import { AppButton, AppCard, EmptyState, ErrorState, Skeleton, cn } from '@mcq/ui';
import { Bell, CalendarClock, Crown, Trophy } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { type AppNotification, useMarkRead, useNotifications } from '@/lib/practice/queries';

const ICON: Record<string, typeof Bell> = {
  exam_reminder: CalendarClock,
  result: Trophy,
  subscription: Crown,
};

const dhakaDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));

/** J1 Inbox: Today / Earlier (Dhaka days), unread dot, open = mark read + deep link. */
export function Inbox() {
  const t = useTranslations('inbox');
  const tc = useTranslations('common');
  const format = useFormatter();
  const errorText = useErrorText();
  const router = useRouter();
  const list = useNotifications();
  const markRead = useMarkRead();
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const unread = list.data?.pages[0]?.unread ?? 0;

  const groups = useMemo(() => {
    const today = dhakaDay(new Date().toISOString());
    const g: { key: 'today' | 'earlier'; items: AppNotification[] }[] = [
      { key: 'today', items: [] },
      { key: 'earlier', items: [] },
    ];
    for (const item of items) {
      (item.created_at && dhakaDay(item.created_at) === today ? g[0]! : g[1]!).items.push(item);
    }
    return g.filter((x) => x.items.length > 0);
  }, [items]);

  const open = (n: AppNotification) => {
    if (!n.read && n.id) markRead.mutate({ ids: [n.id] });
    // Only in-app paths; anything else stays on the inbox.
    if (n.deep_link?.startsWith('/') && !n.deep_link.startsWith('//')) router.push(n.deep_link);
  };

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
        {unread > 0 && (
          <AppButton
            variant="ghost"
            size="sm"
            loading={markRead.isPending}
            onClick={() => markRead.mutate({ all: true })}
          >
            {t('markAll')}
          </AppButton>
        )}
      </div>
      {list.isPending ? (
        <Skeleton aria-busy className="h-64 rounded-lg" />
      ) : list.isError ? (
        <AppCard>
          <ErrorState
            message={errorText(list.error)}
            retryLabel={tc('retry')}
            onRetry={() => void list.refetch()}
          />
        </AppCard>
      ) : items.length === 0 ? (
        <AppCard>
          <EmptyState title={t('empty')} description={t('emptyBody')} />
        </AppCard>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h2 className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              {t(g.key)}
            </h2>
            <AppCard className="p-0">
              <ul className="divide-y divide-border">
                {g.items.map((n) => {
                  const Icon = ICON[n.type ?? ''] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        data-testid="notification"
                        data-unread={!n.read}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-muted',
                          !n.read && 'bg-primary-soft/40',
                        )}
                      >
                        <span className="grid size-10 flex-none place-items-center rounded-md bg-primary-soft text-primary">
                          <Icon aria-hidden size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn('text-body text-text', !n.read && 'font-semibold')}>
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="size-2 flex-none rounded-pill bg-primary">
                                <span className="sr-only">{t('unread')}</span>
                              </span>
                            )}
                          </span>
                          <span className="block text-body-sm text-text-muted">{n.body}</span>
                          {n.created_at && (
                            <span className="block text-caption text-text-subtle">
                              {format.relativeTime(new Date(n.created_at))}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </AppCard>
          </section>
        ))
      )}
      {list.hasNextPage && (
        <AppButton
          variant="secondary"
          className="self-center"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('more')}
        </AppButton>
      )}
    </div>
  );
}

/** Bell in the top bar with the unread dot (docs/06 A). */
export function useUnreadCount(): number {
  const list = useNotifications();
  return list.data?.pages[0]?.unread ?? 0;
}
