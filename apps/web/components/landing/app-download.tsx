import { cn } from '@mcq/ui';
import { Check, RefreshCw } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { StoreBadges } from './store-badges';

/** Seeded timings for the dot field behind the panel, so server and client render the same. */
const DOTS = (() => {
  let seed = 777;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 96 }, () => ({
    animationDuration: `${(7 + rnd() * 9).toFixed(1)}s`,
    animationDelay: `${(-rnd() * 16).toFixed(1)}s`,
  }));
})();

/** App download panel (#app) with a phone mock-up of the app dashboard (illustration). */
export async function AppDownload() {
  const t = await getTranslations('landing.app');
  const p = await getTranslations('landing.app.phone');

  return (
    <section id="app" className="scroll-mt-20 px-4 md:px-8 xl:px-14">
      <div className="relative mx-auto grid max-w-292 items-center gap-7 overflow-hidden rounded-xl bg-text p-7 text-bg md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-14 md:p-12 lg:p-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="landing-fade-left absolute top-1/2 -right-6 grid w-[min(70%,47.5rem)] -translate-y-1/2 grid-cols-12 gap-2.5 md:gap-4.5">
            {DOTS.map((style, i) => (
              <span
                key={i}
                className="landing-bubble aspect-square rounded-pill border-[1.5px] border-bg/15"
                style={style}
              />
            ))}
          </div>
        </div>
        <div className="relative flex min-w-0 flex-col gap-4">
          <h2 className="font-display text-section-title-sm font-semibold text-balance md:text-section-title">
            {t('title')}
          </h2>
          <p className="max-w-[40ch] opacity-80">{t('body')}</p>
          <StoreBadges size="lg" tone="inverse" className="mt-2" />
        </div>
        <div className="relative grid place-items-center justify-self-center py-5">
          <span
            aria-hidden
            className="landing-ripple absolute size-85 rounded-pill border-[1.5px] border-primary/60"
          />
          <span
            aria-hidden
            className="landing-ripple absolute size-85 rounded-pill border-[1.5px] border-primary/60 [animation-delay:2.25s]"
          />
          <div role="img" aria-label={t('phoneLabel')} className="relative">
            <div className="h-120 w-59 rounded-[2.625rem] bg-text p-1.5 shadow-lg ring-1 ring-bg/20">
              <div className="flex size-full flex-col overflow-hidden rounded-[2.25rem] bg-bg text-text">
                <div className="flex h-8.5 flex-none items-center justify-between px-5 text-caption font-semibold">
                  <span>{p('time')}</span>
                  <span className="h-5.5 w-17.5 rounded-pill bg-text" />
                  <span className="h-2.5 w-5 rounded-sm border-[1.5px] border-current opacity-70" />
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pt-2 pb-5 text-caption">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex flex-col">
                      <strong className="font-display text-question font-semibold">
                        {p('greeting')}
                      </strong>
                      <span className="text-text-subtle">{p('countdown')}</span>
                    </span>
                    <span className="mt-0.5 flex-none rounded-pill bg-accent px-2 py-0.5 font-semibold text-on-accent">
                      {p('streak')}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
                    <span className="text-text-subtle">{p('running')}</span>
                    <strong className="text-body-sm font-semibold">{p('runningTitle')}</strong>
                    <div className="h-1.5 rounded-pill bg-surface-muted">
                      <div className="landing-grow h-full w-[31%] rounded-pill bg-primary" />
                    </div>
                    <span className="text-text-muted">{p('runningMeta')}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
                    <span className="text-text-subtle">{p('goal')}</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 flex-1 rounded-pill',
                            i < 3 ? 'bg-primary' : 'bg-surface-muted',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
                    <span className="flex flex-col leading-tight">
                      <span className="text-text-subtle">{p('trend')}</span>
                      <strong className="font-display text-body font-semibold">
                        {p('trendValue')}{' '}
                        <span className="text-caption text-success">{p('trendUp')}</span>
                      </strong>
                    </span>
                    <svg viewBox="0 0 80 30" className="h-7.5 w-20 stroke-primary" fill="none">
                      <polyline
                        points="0,26 16,22 32,24 48,14 64,10 78,3"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-lg border border-border bg-surface px-3 py-2.5">
                    <span className="text-text-subtle">{p('recent')}</span>
                    <div className="flex justify-between pt-1">
                      <span>{p('recent1')}</span>
                      <strong className="font-semibold">{p('recent1Score')}</strong>
                    </div>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span>{p('recent2')}</span>
                      <strong className="font-semibold">{p('recent2Score')}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Capsule
              className="top-15.5 right-[calc(100%-2.75rem)]"
              icon={<Check size={14} strokeWidth={3} />}
              iconClass="bg-success text-on-primary"
            >
              {t('liveRank')}
            </Capsule>
            <Capsule
              className="bottom-17.5 right-[calc(100%-2.75rem)] [animation-delay:1.8s] xl:right-auto xl:left-[calc(100%-2.75rem)]"
              icon={<RefreshCw size={15} strokeWidth={2.4} />}
              iconClass="bg-primary-soft text-primary"
            >
              {t('autoSync')}
            </Capsule>
          </div>
        </div>
      </div>
    </section>
  );
}

function Capsule({
  className,
  icon,
  iconClass,
  children,
}: {
  className: string;
  icon: ReactNode;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'landing-float absolute flex items-center gap-2 rounded-pill border border-border bg-surface py-2 pr-3.5 pl-2 text-body-sm font-semibold whitespace-nowrap text-text shadow-lg max-md:hidden',
        className,
      )}
    >
      <span aria-hidden className={cn('grid size-6.5 place-items-center rounded-pill', iconClass)}>
        {icon}
      </span>
      {children}
    </span>
  );
}
