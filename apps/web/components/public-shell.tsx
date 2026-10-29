import { AppButton, cn, formatInteger } from '@mcq/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { HeaderControls } from '@/components/header-controls';
import { MobileMenu } from '@/components/landing/mobile-menu';
import { SOCIAL_NAMES, SocialIcon } from '@/components/landing/social-icons';
import { StoreBadges } from '@/components/landing/store-badges';
import { Link } from '@/i18n/navigation';
import { publicApi, publicData } from '@/lib/server/public-api';
import { type SocialNetwork, site } from '@/lib/site';

/** Header links jump to landing sections; from other public pages they go back to `/`. */
const NAV = [
  { key: 'exams', hash: 'try' },
  { key: 'bank', hash: 'features' },
  { key: 'plans', hash: 'pricing' },
  { key: 'app', hash: 'app' },
] as const;

const WRAP = 'mx-auto w-full max-w-(--breakpoint-xl) px-4 md:px-8 xl:px-14';

/** Public pages (landing, plans, question pages): sticky blurred header and the full footer. */
export async function PublicShell({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--mcq-z-sticky) border-b border-border bg-bg/90 backdrop-blur-md">
        <div className={cn(WRAP, 'flex items-center gap-3 py-2.5 lg:gap-8')}>
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
                className="inline-flex min-h-11 items-center rounded-md px-3.5 font-medium text-text-muted transition-colors duration-(--mcq-duration-fast) hover:bg-surface-muted hover:text-text"
              >
                {t(`landing.nav.${key}`)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <HeaderControls compact />
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-md px-4 font-semibold text-text hover:bg-surface-muted"
              >
                {t('auth.login')}
              </Link>
            </div>
            <AppButton
              asChild
              variant="secondary"
              size="sm"
              className="h-11 border-text px-4 text-body motion-safe:active:scale-97"
            >
              <Link href="/register">{t('landing.ctaFree')}</Link>
            </AppButton>
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
              <div className="flex flex-wrap items-center gap-2.5 pt-3.5">
                <AppButton asChild variant="secondary" className="h-12 flex-1">
                  <Link href="/login">{t('auth.login')}</Link>
                </AppButton>
                <HeaderControls />
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

async function SiteFooter() {
  const t = await getTranslations('landing.footer');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const settings = await publicData(publicApi(locale, 3600).GET('/settings/public'));
  const examLinks = t.raw('examLinks') as string[];
  const social = (Object.entries(site.social) as [SocialNetwork, string | null][]).filter(
    (e): e is [SocialNetwork, string] => e[1] !== null,
  );

  const heading = 'mb-2 text-body-sm font-semibold text-text-subtle';
  const link =
    'flex min-h-9 items-center text-text-muted transition-colors duration-(--mcq-duration-fast) hover:text-text';

  return (
    <footer className="relative mt-14 overflow-hidden border-t border-border bg-surface md:mt-28">
      <div className={cn(WRAP, 'flex flex-col gap-8 pt-10 md:gap-12 md:pt-16')}>
        <div className="grid gap-7 sm:grid-cols-2 md:gap-14 lg:grid-cols-[1.6fr_0.8fr_0.9fr_1.2fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Brand name={tc('brandName')} size="lg" className="self-start" />
            <p className="max-w-[34ch] text-body text-text-muted">{t('tagline')}</p>
            <StoreBadges size="sm" />
          </div>
          <nav aria-label={t('exams')} className="flex min-w-0 flex-col text-body">
            <p className={heading}>{t('exams')}</p>
            {examLinks.map((label) => (
              <Link key={label} href="/register" className={link}>
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label={t('help')} className="flex min-w-0 flex-col text-body">
            <p className={heading}>{t('help')}</p>
            <Link href={{ pathname: '/', hash: 'faq' }} className={link}>
              {t('faq')}
            </Link>
            <Link href="/plans" className={link}>
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
            <p className={cn(heading, 'mb-0')}>{t('contact')}</p>
            {site.supportEmail && (
              <a
                href={`mailto:${site.supportEmail}`}
                className="flex min-h-8 items-center font-medium text-text"
              >
                {site.supportEmail}
              </a>
            )}
            {settings?.support_phone && (
              <a href={`tel:${settings.support_phone}`} className="text-text-muted hover:text-text">
                <span lang="en">{settings.support_phone}</span> · {t('hours')}
              </a>
            )}
            {social.length > 0 && (
              <ul aria-label={t('social')} className="mt-1.5 flex flex-wrap gap-2">
                {social.map(([network, href]) => (
                  <li key={network}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_NAMES[network]}
                      title={SOCIAL_NAMES[network]}
                      className="grid size-9 place-items-center rounded-pill border-[1.5px] border-border-strong text-text transition-[background-color,color,border-color,transform] duration-(--mcq-duration-slow) ease-standard hover:border-text hover:bg-text hover:text-bg motion-safe:hover:-translate-y-0.5"
                    >
                      <SocialIcon network={network} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <nav
          aria-label={t('navLabel')}
          className="flex flex-wrap items-center gap-x-4.5 gap-y-1.5 border-t border-border py-4.5 text-body-sm text-text-subtle"
        >
          <span>
            {t('copyright', {
              year: formatInteger(new Date().getFullYear(), locale),
              brand: tc('brandName'),
            })}
          </span>
          {(['privacy', 'terms', 'refund', 'about'] as const).map((key) => (
            <Link key={key} href={`/${key}`} className="hover:text-text">
              {t(key)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
