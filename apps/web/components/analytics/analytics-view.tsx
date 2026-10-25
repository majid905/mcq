'use client';

import {
  AppButton,
  AppCard,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  StatTile,
  formatDecimal,
  formatInteger,
  subscribeThemePreference,
} from '@mcq/ui';
import { ChevronRight, Flame, TriangleAlert } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FormError } from '@/components/auth/fields';
import { useStartPractice } from '@/components/practice/use-start-practice';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/hooks';
import { useAnalyticsOverview, useAnalyticsProgress, useTopicStats } from '@/lib/practice/queries';

const VARS = ['chart1', 'chart2', 'text-muted', 'border', 'surface', 'text'] as const;
type Colors = Record<(typeof VARS)[number], string>;

/** Token colours for SVG (Recharts sets them as attributes, where var() is not reliable). */
function useChartColors(): Colors | null {
  const [colors, setColors] = useState<Colors | null>(null);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      setColors(
        Object.fromEntries(
          VARS.map((v) => [v, style.getPropertyValue(`--mcq-color-${v}`).trim()]),
        ) as Colors,
      );
    };
    const id = setTimeout(read, 0);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    const off = subscribeThemePreference(read);
    return () => {
      clearTimeout(id);
      mq.removeEventListener('change', read);
      off();
    };
  }, []);
  return colors;
}

function ChartCard({
  title,
  children,
  table,
}: {
  title: string;
  children: ReactNode;
  table: ReactNode;
}) {
  const t = useTranslations('analytics');
  return (
    <AppCard className="flex flex-col gap-3">
      <h2 className="text-h3 font-semibold text-text">{title}</h2>
      {children}
      <details>
        <summary className="cursor-pointer text-body-sm font-medium text-primary">
          {t('showTable')}
        </summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </AppCard>
  );
}

/** H1 Analytics (FR-ANL-01..03). Web: two columns. */
export function AnalyticsView() {
  const t = useTranslations('analytics');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const colors = useChartColors();
  const overview = useAnalyticsOverview();
  const progress = useAnalyticsProgress();
  const topics = useTopicStats(null);
  const practice = useStartPractice();
  const n = (v: number | null | undefined) => formatInteger(v ?? 0, locale);
  const d = (v: number | null | undefined) => formatDecimal(v ?? 0, locale, 0);

  if (overview.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }
  if (overview.isError) {
    return (
      <AppCard>
        <ErrorState
          message={errorText(overview.error)}
          retryLabel={tc('retry')}
          onRetry={() => void overview.refetch()}
        />
      </AppCard>
    );
  }

  const o = overview.data;
  const days = (o.last_7_days ?? []).map((day) => ({
    label: format.dateTime(new Date(`${day.day}T00:00:00Z`), { weekday: 'short', timeZone: 'UTC' }),
    answered: day.answered ?? 0,
    correct: day.correct ?? 0,
  }));
  const exams = (progress.data ?? []).map((p, i) => ({
    label: n(i + 1),
    title: p.title ?? '',
    percentile: p.percentile ?? 0,
    date: p.date ? format.dateTime(new Date(p.date), { day: 'numeric', month: 'short' }) : '',
  }));
  const subjects = [...(topics.data ?? [])].sort(
    (a, b) => (a.accuracy_pct ?? 0) - (b.accuracy_pct ?? 0),
  );
  const weak = subjects.filter((s) => s.is_weak);
  const name = (s: (typeof subjects)[number]) =>
    (s.node ? (locale === 'bn' ? s.node.name_bn : s.node.name_en) : '') ?? '';
  const tick = { fill: colors?.['text-muted'], fontSize: 12 };
  const tooltipStyle = {
    background: colors?.surface,
    border: `1px solid ${colors?.border}`,
    borderRadius: 12,
    color: colors?.text,
  };

  return (
    <div className="flex flex-col gap-5" data-testid="analytics">
      <h1 className="text-h1 font-bold text-text">{t('title')}</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatTile label={t('answered')} value={formatDecimal(o.answered_total ?? 0, locale, 0)} />
        <StatTile label={t('accuracy')} value={`${d(o.accuracy_pct)}%`} />
        <StatTile label={t('exams')} value={n(o.exams_taken)} />
        <StatTile
          label={t('percentile')}
          value={o.avg_percentile === null ? '–' : d(o.avg_percentile)}
        />
        <StatTile
          label={t('streak', { best: n(o.best_streak) })}
          value={n(o.current_streak)}
          icon={<Flame aria-hidden size={18} className="text-accent" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title={t('last7')}
          table={
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-caption text-text-muted">
                  <th scope="col" className="py-1">
                    {t('day')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('seriesAnswered')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('seriesCorrect')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-1 text-text">{row.label}</td>
                    <td className="py-1 text-right tabular-nums text-text">{n(row.answered)}</td>
                    <td className="py-1 text-right tabular-nums text-text">{n(row.correct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <div className="h-56" role="img" aria-label={t('last7Label')}>
            {colors && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={days}
                  barGap={2}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke={colors.border} />
                  <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={tick}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tickFormatter={(v: number) => n(v)}
                  />
                  <Tooltip
                    cursor={{ fill: colors.border, opacity: 0.4 }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: colors.text }}
                    formatter={(v) => n(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: colors['text-muted'] }} />
                  <Bar
                    dataKey="answered"
                    name={t('seriesAnswered')}
                    fill={colors.chart1}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                  <Bar
                    dataKey="correct"
                    name={t('seriesCorrect')}
                    fill={colors.chart2}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard
          title={t('progress')}
          table={
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-caption text-text-muted">
                  <th scope="col" className="py-1">
                    {t('exam')}
                  </th>
                  <th scope="col" className="py-1 text-right">
                    {t('percentileShort')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {exams.map((row) => (
                  <tr key={row.label} className="border-t border-border">
                    <td className="py-1 text-text">
                      {row.title} <span className="text-text-muted">· {row.date}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-text">{d(row.percentile)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          {progress.isPending ? (
            <Skeleton className="h-56 rounded-md" />
          ) : exams.length === 0 ? (
            <EmptyState title={t('noExams')} />
          ) : (
            <div className="h-56" role="img" aria-label={t('progressLabel')}>
              {colors && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={exams} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={colors.border} />
                    <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tick={tick}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => n(v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      itemStyle={{ color: colors.text }}
                      labelFormatter={(_l, payload) => {
                        const p = payload?.[0]?.payload as (typeof exams)[number] | undefined;
                        return p ? `${p.title} · ${p.date}` : '';
                      }}
                      formatter={(v) => [d(Number(v)), t('percentileShort')]}
                    />
                    <Line
                      type="monotone"
                      dataKey="percentile"
                      stroke={colors.chart1}
                      strokeWidth={2}
                      dot={{ r: 4, fill: colors.chart1, stroke: colors.surface, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </ChartCard>

        <AppCard className="flex flex-col gap-3">
          <h2 className="text-h3 font-semibold text-text">{t('bySubject')}</h2>
          {topics.isPending ? (
            <Skeleton className="h-40 rounded-md" />
          ) : subjects.length === 0 ? (
            <EmptyState title={t('noSubjects')} />
          ) : (
            <ul className="flex flex-col gap-1">
              {subjects.map((s) => (
                <li key={s.node?.id}>
                  <Link
                    href={`/practice/node/${s.node?.id}`}
                    className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-surface-muted"
                  >
                    <span className="w-36 truncate text-body-sm text-text sm:w-44">{name(s)}</span>
                    <ProgressBar
                      value={s.accuracy_pct ?? 0}
                      max={100}
                      label={name(s)}
                      className="flex-1"
                    />
                    <span className="w-12 text-right text-body-sm font-semibold tabular-nums text-text">
                      {d(s.accuracy_pct)}%
                    </span>
                    {s.is_weak && (
                      <TriangleAlert aria-label={t('weak')} size={16} className="text-warning" />
                    )}
                    <ChevronRight aria-hidden size={16} className="text-text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AppCard>

        <AppCard className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-h3 font-semibold text-text">
            <TriangleAlert aria-hidden size={18} className="text-warning" />
            {t('weakTitle')}
          </h2>
          {weak.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t('noWeak')}</p>
          ) : (
            <>
              <p className="text-body-sm text-text-muted">{weak.map(name).join(' · ')}</p>
              <AppButton
                className="self-start"
                loading={practice.isPending}
                onClick={() =>
                  practice.start(
                    {
                      mode: 'quick',
                      node_ids: weak.map((w) => w.node?.id ?? ''),
                      question_count: 20,
                    },
                    t('weakTitle'),
                  )
                }
              >
                {t('practiceNow')}
              </AppButton>
              <FormError message={practice.error ? errorText(practice.error) : null} />
            </>
          )}
        </AppCard>
      </div>
    </div>
  );
}
