'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useApi } from './providers';

/** Proves the client + mock wiring: GET /health and GET /settings/public. */
export function ApiStatus() {
  const api = useApi();
  const t = useTranslations();
  const format = useFormatter();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, response } = await api.GET('/health');
      if (!data) throw new Error(`GET /health ${response.status}`);
      return data.data;
    },
  });
  const settings = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => {
      const { data, response } = await api.GET('/settings/public');
      if (!data) throw new Error(`GET /settings/public ${response.status}`);
      return data.data;
    },
  });

  if (health.isPending) {
    return (
      <div
        data-testid="api-status-loading"
        aria-label={t('common.loading')}
        className="h-24 animate-pulse rounded-lg bg-surface-muted"
      />
    );
  }

  const ok = health.isSuccess && health.data.status === 'ok';
  return (
    <section
      data-testid="api-status"
      data-status={ok ? 'ok' : 'down'}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-h3 font-semibold">{t('home.apiStatus')}</h2>
        <span
          className={
            ok
              ? 'rounded-pill bg-success-soft px-3 py-1 text-caption text-success'
              : 'rounded-pill bg-danger-soft px-3 py-1 text-caption text-danger'
          }
        >
          {ok ? `✓ ${t('home.apiOk')}` : `✕ ${t('home.apiDown')}`}
        </span>
      </div>
      {health.isSuccess && (
        <p className="mt-2 text-body-sm text-text-muted">
          {t('home.serverTime', {
            time: format.dateTime(new Date(health.data.server_time), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </p>
      )}
      {settings.data?.free_live_exams_per_month !== undefined && (
        <p className="mt-1 text-body-sm text-text-muted">
          {t('home.freeLiveExams', { count: settings.data.free_live_exams_per_month })}
        </p>
      )}
      {health.isError && (
        <button
          type="button"
          onClick={() => void health.refetch()}
          className="mt-3 h-10 rounded-md border border-border-strong px-4 text-body-sm font-semibold"
        >
          {t('common.retry')}
        </button>
      )}
    </section>
  );
}
