import { cn, formatInteger } from '@mcq/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { Brand } from '@/components/brand';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { MobileMenu } from '@/components/landing/mobile-menu';
import { SOCIAL_NAMES, SocialIcon } from '@/components/landing/social-icons';
import { StoreBadges } from '@/components/landing/store-badges';
import { ThemeSwitch } from '@/components/landing/theme-switch';
import { Link } from '@/i18n/navigation';
import { type SocialNetwork, site } from '@/lib/site';
import '@/components/landing/brand-theme.css';
import '@/components/landing/landing.css';

/** Header links jump to landing sections; from other public pages they go back to `/`. */
const NAV = [
  { key: 'exams', hash: 'try' },
  { key: 'bank', hash: 'features' },
  { key: 'plans', hash: 'pricing' },
  { key: 'app', hash: 'app' },
] as const;

// Design: max-width 1280, side padding clamp(16px, 4vw, 56px).
const WRAP = 'mx-auto w-full max-w-(--breakpoint-xl) px-[clamp(--spacing(4),4vw,--spacing(14))]';

/** Public pages (landing, plans, question pages): sticky blurred header and the full footer. */
export async function PublicShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const themeLabels = {
    toDark: t('landing.nav.toDark'),
    toLight: t('landing.nav.toLight'),
    darkShort: t('landing.nav.darkShort'),
    lightShort: t('landing.nav.lightShort'),
  };
  return (
    <div className="brand-theme flex min-h-dvh flex-col text-question leading-[1.65]">
      <header className="sticky top-0 z-(--mcq-z-sticky) border-b border-border bg-(--brand-hdr) backdrop-blur-[14px]">
        <div
          className={cn(
            WRAP,
            'flex items-center gap-[clamp(--spacing(3),2.4vw,--spacing(8))] py-2.5',
          )}
        >
          <Link
            href="/"
            aria-label={t('common.brandName')}
            className="inline-flex min-h-11 items-center"
          >
            <Brand name={t('common.brandName')} />
          </Link>
          <nav aria-label={t('landing.nav.label')} className="hidden gap-1 lg:flex">
            {NAV.map(({ key, hash }) => (
              <Link
                key={key}
                href={{ pathname: '/', hash }}
                className="inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-question leading-relaxed font-medium text-text-muted hover:bg-surface-muted hover:text-text"
              >
                {t(`landing.nav.${key}`)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <ThemeSwitch labels={themeLabels} />
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-md px-4 text-question font-semibold text-text hover:bg-surface-muted"
              >
                {t('auth.login')}
              </Link>
            </div>
            <Link
              href="/register"
              className="inline-flex min-h-11 items-center rounded-md px-[clamp(--spacing(3.5),1.6vw,--spacing(5))] text-[clamp(var(--mcq-font-size-meta),1.2vw,var(--mcq-font-size-question))] font-semibold whitespace-nowrap text-text shadow-[inset_0_0_0_1.5px_var(--color-text)] transition-transform duration-(--mcq-duration-fast) hover:bg-surface-muted active:scale-97"
            >
              {t('landing.ctaFree')}
            </Link>
            <MobileMenu
              openLabel={t('landing.nav.openMenu')}
              closeLabel={t('landing.nav.closeMenu')}
              navLabel={t('landing.nav.mobileLabel')}
            >
              {NAV.map(({ key, hash }) => (
                <Link
                  key={key}
                  href={{ pathname: '/', hash }}
                  className="flex min-h-13 items-center border-b border-border font-medium text-text"
                >
                  {t(`landing.nav.${key}`)}
                </Link>
              ))}
              <div className="flex gap-2.5 pt-3.5">
                <Link
                  href="/login"
                  className="flex min-h-12 flex-1 items-center justify-center rounded-md border-[1.5px] border-border-strong font-semibold text-text"
                >
                  {t('auth.login')}
                </Link>
                <ThemeSwitch labels={themeLabels} variant="menu" />
              </div>
              <div className="flex justify-center pt-3">
                <Language />
              </div>
            </MobileMenu>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** The design's header has no language switch; it sits in the mobile menu and the footer. */
async function Language() {
  const t = await getTranslations('locale');
  const locale = await getLocale();
  return (
    // useSearchParams inside needs a boundary on statically rendered pages.
    <Suspense>
      <LocaleSwitcher
        target={locale === 'bn' ? 'en' : 'bn'}
        label={t('switchLabel')}
        text={t('switchTo')}
      />
    </Suspense>
  );
}

async function SiteFooter() {
  const t = await getTranslations('landing.footer');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const examLinks = t.raw('examLinks') as string[];
  const social = Object.entries(site.social) as [SocialNetwork, string | null][];

  const heading = 'mb-2 text-[13px] font-semibold tracking-[0.02em] text-text-subtle';
  const link =
    'flex min-h-9 items-center text-text-muted transition-colors duration-200 hover:text-text';

  return (
    <footer className="mt-[clamp(56px,8vw,112px)] overflow-hidden border-t border-border bg-surface">
      <div
        className={cn(WRAP, 'flex flex-col gap-[clamp(32px,4vw,48px)] pt-[clamp(40px,5vw,64px)]')}
      >
        <div className="grid gap-[clamp(28px,4vw,56px)] md:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Brand name={tc('brandName')} size="lg" className="self-start" />
            <p className="max-w-[34ch] text-[16px] text-pretty text-text-muted">{t('tagline')}</p>
            <StoreBadges size="sm" className="gap-2.5" />
          </div>
          <nav aria-label={t('exams')} className="flex min-w-0 flex-col gap-0.5 text-[15px]">
            <strong className={heading}>{t('exams')}</strong>
            {examLinks.map((label) => (
              <Link key={label} href="/register" className={link}>
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label={t('help')} className="flex min-w-0 flex-col gap-0.5 text-[15px]">
            <strong className={heading}>{t('help')}</strong>
            <Link href={{ pathname: '/', hash: 'faq' }} className={link}>
              {t('faq')}
            </Link>
            <Link href={{ pathname: '/', hash: 'pricing' }} className={link}>
              {t('plans')}
            </Link>
            <Link href={{ pathname: '/', hash: 'app' }} className={link}>
              {t('app')}
            </Link>
            <Link href="/contact" className={link}>
              {t('contact')}
            </Link>
          </nav>
          <div className="flex min-w-0 flex-col gap-2.5">
            <strong className={cn(heading, '-mb-0.5')}>{t('contact')}</strong>
            <a
              href={`mailto:${site.supportEmail ?? t('email')}`}
              className="flex min-h-8 items-center text-[15px] font-medium text-text"
            >
              {site.supportEmail ?? t('email')}
            </a>
            <span className="text-[15px] text-text-muted">{t('phoneHours')}</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {social.map(([network, href]) => (
                <a
                  key={network}
                  href={href ?? '#'}
                  target={href ? '_blank' : undefined}
                  rel={href ? 'noopener noreferrer' : undefined}
                  aria-label={SOCIAL_NAMES[network]}
                  title={SOCIAL_NAMES[network]}
                  className="grid size-9 place-items-center rounded-pill border-[1.5px] border-border-strong text-text transition-[background-color,color,border-color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:border-text hover:bg-text hover:text-bg"
                >
                  <SocialIcon network={network} />
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 border-t border-border py-[18px]">
          <nav
            aria-label={t('navLabel')}
            className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[14px] text-text-subtle"
          >
            <span>
              {t('copyright', {
                year: formatInteger(new Date().getFullYear(), locale),
                brand: tc('brandName'),
              })}
            </span>
            {(['privacy', 'terms', 'about'] as const).map((key) => (
              <Link key={key} href={`/${key}`} className="hover:text-text">
                {t(key)}
              </Link>
            ))}
          </nav>
          <Language />
        </div>
      </div>
    </footer>
  );
}
