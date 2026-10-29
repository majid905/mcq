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
    <section id="app" className="scroll-mt-20 px-[clamp(16px,4vw,56px)]">
      <div className="relative mx-auto grid max-w-[1168px] items-center gap-[clamp(28px,4vw,56px)] overflow-hidden rounded-[28px] bg-text p-[clamp(28px,5vw,64px)] text-bg md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="landing-fade-left absolute top-1/2 -right-6 grid w-[min(70%,760px)] -translate-y-1/2 grid-cols-12 gap-[clamp(10px,1.4vw,18px)]">
            {DOTS.map((style, i) => (
              <span
                key={i}
                className="landing-bubble aspect-square rounded-pill border-[1.5px] border-[color-mix(in_oklab,currentColor_16%,transparent)]"
                style={style}
              />
            ))}
          </div>
        </div>
        <div className="relative flex min-w-0 flex-col gap-4">
          <h2 className="font-display text-[length:clamp(28px,3.4vw,46px)] leading-[1.3] font-semibold text-balance">
            {t('title')}
          </h2>
          <p className="max-w-[40ch] opacity-[0.82]">{t('body')}</p>
          <StoreBadges size="lg" className="mt-2" />
        </div>
        <div className="relative grid place-items-center justify-self-center py-5">
          <span
            aria-hidden
            className="landing-ripple absolute size-[340px] rounded-pill border-[1.5px] border-[color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
          />
          <span
            aria-hidden
            className="landing-ripple absolute size-[340px] rounded-pill border-[1.5px] border-[color-mix(in_oklab,var(--color-primary)_60%,transparent)] [animation-delay:2.25s]"
          />
          <div role="img" aria-label={t('phoneLabel')} className="relative">
            <div className="h-[480px] w-[236px] rounded-[42px] bg-(--brand-phone) p-1.5 shadow-[inset_0_0_0_1.5px_#2e333b,0_0_0_1px_rgb(255_255_255/0.12),0_50px_80px_-30px_rgb(0_0_0/0.6)]">
              <div className="flex size-full flex-col overflow-hidden rounded-[36px] bg-bg leading-[1.45] text-text">
                <div className="flex h-[34px] flex-none items-center justify-between px-5 font-sans text-[12px] font-semibold">
                  <span>{p('time')}</span>
                  <span className="h-[22px] w-[70px] rounded-pill bg-(--brand-phone)" />
                  <span className="h-2.5 w-5 rounded-[3px] border-[1.5px] border-current opacity-70" />
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 pt-2 pb-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex flex-col">
                      <strong className="font-display text-[17px] font-semibold">
                        {p('greeting')}
                      </strong>
                      <span className="text-[12px] text-text-subtle">{p('countdown')}</span>
                    </span>
                    <span className="mt-[3px] flex-none rounded-pill bg-accent px-[9px] py-0.5 text-[12px] font-semibold text-on-accent">
                      {p('streak')}
                    </span>
                  </div>
                  <PhoneCard>
                    <span className="text-[12px] text-text-subtle">{p('running')}</span>
                    <strong className="text-[14px] font-semibold">{p('runningTitle')}</strong>
                    <div className="h-1.5 rounded-[3px] bg-surface-muted">
                      <div className="landing-grow h-full w-[31%] rounded-[3px] bg-primary" />
                    </div>
                    <span className="text-[12px] text-text-muted">{p('runningMeta')}</span>
                  </PhoneCard>
                  <PhoneCard>
                    <span className="text-[12px] text-text-subtle">{p('goal')}</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 flex-1 rounded-[3px]',
                            i < 3 ? 'bg-primary' : 'bg-surface-muted',
                          )}
                        />
                      ))}
                    </div>
                  </PhoneCard>
                  <div className="flex items-center justify-between gap-2 rounded-[14px] border border-border bg-surface p-3">
                    <span className="flex flex-col leading-[1.3]">
                      <span className="text-[12px] text-text-subtle">{p('trend')}</span>
                      <strong className="font-display text-[16px] font-semibold">
                        {p('trendValue')}{' '}
                        <span className="text-[12px] text-(--brand-oki)">{p('trendUp')}</span>
                      </strong>
                    </span>
                    <svg viewBox="0 0 80 30" className="h-[30px] w-20 stroke-primary" fill="none">
                      <polyline
                        points="0,26 16,22 32,24 48,14 64,10 78,3"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-[14px] border border-border bg-surface px-3 py-2.5 text-[12px]">
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
              className="top-[62px] right-[calc(100%-44px)] [animation-duration:5s] [animation-delay:1s]"
              icon={<Check size={14} strokeWidth={3} />}
              iconClass="bg-success text-(--brand-on-solid)"
            >
              {t('liveRank')}
            </Capsule>
            <Capsule
              className="right-[calc(100%-44px)] bottom-[70px] [animation-duration:5.5s] [animation-delay:1.8s] min-[1200px]:right-auto min-[1200px]:left-[calc(100%-44px)]"
              icon={<RefreshCw size={15} strokeWidth={2.4} />}
              iconClass="bg-primary-soft text-(--brand-pri)"
            >
              {t('autoSync')}
            </Capsule>
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface p-3">
      {children}
    </div>
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
        'landing-float absolute flex items-center gap-2 rounded-pill border border-border bg-surface py-2 pr-3.5 pl-2 text-[14px] font-semibold whitespace-nowrap text-text shadow-[0_16px_32px_-14px_rgb(0_0_0/0.45)] max-md:hidden',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('grid size-[26px] place-items-center rounded-pill', iconClass)}
      >
        {icon}
      </span>
      {children}
    </span>
  );
}
