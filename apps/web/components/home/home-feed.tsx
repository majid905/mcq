'use client';

import {
  AppButton,
  AppCard,
  AppChip,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  formatInteger,
} from '@mcq/ui';
import { Bookmark, Flame, Library, NotebookPen, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { type HomeFeed as Feed, useHome, useMe } from '@/lib/queries';
import { greetingKey, useServerNow } from '@/lib/time';
import { BannerCarousel } from './banner-carousel';
import { NextExamCard, RunningExamCard } from './exam-cards';

const QUICK = [
  { href: '/practice', key: 'practice', icon: NotebookPen },
  { href: '/bank', key: 'bank', icon: Library },
  { href: '/search', key: 'search', icon: Search },
  { href: '/bookmarks', key: 'bookmarks', icon: Bookmark },
] as const;

function HomeSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4" data-testid="home-loading">
      <Skeleton className="h-12 w-60" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="aspect-[16/7] rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function TodayCard({ today }: { today: NonNullable<Feed['today']> }) {
  const t = useTranslations('home');
  const locale = useLocale();
  const n = (v: number | undefined) => formatInteger(v ?? 0, locale);
  const goal = today.goal ?? 10;
  const answered = today.answered ?? 0;
  const done = answered >= goal;
  return (
    <AppCard data-testid="today">
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-text">{t('todayGoal')}</h2>
        <span className="text-caption text-text-muted">
          {t('answeredOfGoal', { answered: n(answered), goal: n(goal) })}
        </span>
      </div>
      <ProgressBar
        value={answered}
        max={goal}
        label={t('todayGoal')}
        tone={done ? 'success' : 'primary'}
        className="my-3"
      />
      <p className="text-body-sm text-text-muted">
        {t('accuracy', { pct: n(Math.round(today.accuracy_pct ?? 0)) })}
        {' · '}
        {done ? t('goalDone') : t('goalLeft', { count: n(goal - answered) })}
      </p>
      <AppButton asChild variant="ghost" size="sm" className="mt-2 -ml-3">
        <Link href="/practice">{t('keepPracticing')}</Link>
      </AppButton>
    </AppCard>
  );
}

/** C1 Home (FR-HOME-01..03). ≥ 1024 px: left 2/3 exams + today, right 1/3 quick actions + banners. */
export function HomeFeed() {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const me = useMe();
  const home = useHome();
  const now = useServerNow(home.data?.server_time);

  if (home.isPending) return <HomeSkeleton />;
  if (home.isError) {
    return (
      <AppCard>
        <ErrorState
          message={errorText(home.error)}
          retryLabel={tc('retry')}
          onRetry={() => void home.refetch()}
          retrying={home.isFetching}
        />
      </AppCard>
    );
  }

  const feed = home.data;
  const running = feed.running_exams ?? [];
  const next = feed.next_exam ?? null;
  const streak = feed.today?.streak ?? 0;
  const name = me.data?.name?.split(' ').slice(-1)[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-body-sm text-text-muted">{t(`greeting.${greetingKey(now)}`)}</p>
          <h1 className="text-h2 font-semibold text-text">{name ?? t('title')}</h1>
        </div>
        <div className="flex gap-2">
          {streak > 0 && (
            <AppChip variant="accent" icon={<Flame aria-hidden size={14} />}>
              {t('streak', { count: formatInteger(streak, locale) })}
            </AppChip>
          )}
          {me.data?.subscription?.is_premium && <AppChip variant="primary">{t('premium')}</AppChip>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {running.map((exam) => (
            <RunningExamCard key={exam.id} exam={exam} now={now} />
          ))}
          {next && <NextExamCard exam={next} now={now} />}
          {running.length === 0 && !next && (
            <AppCard>
              <EmptyState
                title={t('noExamsTitle')}
                description={t('noExamsBody')}
                action={
                  <AppButton asChild size="sm">
                    <Link href="/practice">{t('keepPracticing')}</Link>
                  </AppButton>
                }
              />
            </AppCard>
          )}
          {feed.today && <TodayCard today={feed.today} />}
          {feed.continue_practice && (
            <AppCard interactive className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption text-text-muted">{t('continuePractice')}</p>
                <p className="truncate text-body font-semibold text-text">
                  {feed.continue_practice.title}
                </p>
                <ProgressBar
                  value={feed.continue_practice.answered ?? 0}
                  max={feed.continue_practice.total ?? 1}
                  label={t('continuePractice')}
                  className="mt-2 w-40"
                />
              </div>
              <AppButton asChild size="sm">
                <Link href={`/practice/session/${feed.continue_practice.attempt_id}`}>
                  {t('continue')}
                </Link>
              </AppButton>
            </AppCard>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <nav aria-label={t('quickActions')} className="grid grid-cols-2 gap-3">
            {QUICK.map(({ href, key, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 hover:border-border-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="grid size-8 place-items-center rounded-md bg-primary-soft text-primary">
                  <Icon aria-hidden size={18} strokeWidth={1.75} />
                </span>
                <span className="text-body-sm font-semibold text-text">{t(`quick.${key}`)}</span>
              </Link>
            ))}
          </nav>
          <BannerCarousel banners={feed.banners ?? []} />
        </div>
      </div>
    </div>
  );
}
