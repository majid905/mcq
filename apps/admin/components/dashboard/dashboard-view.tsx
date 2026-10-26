'use client';

import { AppCard, AppChip, ErrorState, Skeleton, StatTile, cn, formatDecimal } from '@mcq/ui';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useDashboard } from '@/lib/queries';

/** Backlog above this is worth a look (warning icon + text, not colour alone). */
const QUEUE_WARN = 100;

/** L2 Dashboard (FR-ADM-03): KPIs, upcoming exams, queue health. */
export function DashboardView() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const dash = useDashboard();
  const n = (v: number | undefined) => formatDecimal(v ?? 0, locale, 0);
  const money = (v: number | undefined) => `৳${formatDecimal(v ?? 0, locale, 0)}`;

  if (dash.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (dash.isError) {
    return (
      <AppCard>
        <ErrorState
          message={dash.error.message}
          retryLabel={tc('retry')}
          onRetry={() => void dash.refetch()}
        />
      </AppCard>
    );
  }

  const d = dash.data;
  const queues = Object.entries(d.queues ?? {});

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatTile label={t('signupsToday')} value={n(d.signups_today)} />
        <StatTile label={t('dau')} value={n(d.dau)} />
        <StatTile label={t('mau')} value={n(d.mau)} />
        <StatTile label={t('revenueToday')} value={money(d.revenue_today_bdt)} />
        <StatTile label={t('revenueMonth')} value={money(d.revenue_month_bdt)} />
        <StatTile label={t('activeSubs')} value={n(d.active_subscriptions)} />
        <StatTile label={t('published')} value={n(d.questions_published)} />
        <Link
          href="/reports"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <StatTile
            label={t('openReports')}
            value={n(d.open_reports)}
            tone={(d.open_reports ?? 0) > 0 ? 'danger' : 'default'}
            className="h-full hover:border-border-strong"
          />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AppCard className="overflow-x-auto p-0 xl:col-span-2">
          <h2 className="px-4 pt-4 text-h3 font-semibold text-text">{t('upcoming')}</h2>
          {(d.upcoming_exams ?? []).length === 0 ? (
            <p className="px-4 py-6 text-body-sm text-text-muted">{t('noUpcoming')}</p>
          ) : (
            <table className="mt-2 w-full min-w-[560px] text-body-sm">
              <thead>
                <tr className="border-b border-border text-left text-caption text-text-muted">
                  <th scope="col" className="h-11 px-4 font-medium">
                    {t('exam')}
                  </th>
                  <th scope="col" className="px-4 font-medium">
                    {t('starts')}
                  </th>
                  <th scope="col" className="px-4 text-right font-medium">
                    {t('questions')}
                  </th>
                  <th scope="col" className="px-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(d.upcoming_exams ?? []).map((e) => (
                  <tr key={e.id} className="h-11 border-b border-border last:border-b-0">
                    <td className="px-4 text-text">
                      <Link
                        href={`/exams/${e.id}/builder`}
                        className="font-medium hover:text-primary"
                      >
                        {e.title}
                      </Link>
                      <span className="ml-2 text-caption text-text-muted">{e.category}</span>
                    </td>
                    <td className="px-4 text-text-muted">
                      {e.start_at &&
                        format.dateTime(new Date(e.start_at), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Asia/Dhaka',
                        })}
                    </td>
                    <td className="px-4 text-right tabular-nums text-text">
                      {n(e.question_count)}
                    </td>
                    <td className="px-4 text-right">
                      {e.is_premium && <AppChip variant="accent">{t('premium')}</AppChip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AppCard>

        <AppCard>
          <h2 className="text-h3 font-semibold text-text">{t('queues')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {queues.map(([name, backlog]) => {
              const warn = backlog > QUEUE_WARN;
              return (
                <li key={name} className="flex items-center justify-between gap-2 text-body-sm">
                  <span className="font-mono text-text">{name}</span>
                  <span
                    className={cn(
                      'flex items-center gap-1 tabular-nums',
                      warn ? 'text-warning' : 'text-success',
                    )}
                  >
                    {warn ? (
                      <CircleAlert aria-hidden size={16} />
                    ) : (
                      <CircleCheck aria-hidden size={16} />
                    )}
                    {n(backlog)}
                    <span className="sr-only">{warn ? t('backlogHigh') : t('backlogOk')}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-caption text-text-muted">{t('revenueChartPending')}</p>
        </AppCard>
      </div>
    </div>
  );
}
