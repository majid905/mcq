import { ThemeToggle } from '@mcq/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from './locale-switcher';

export async function SiteHeader() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <header className="sticky top-0 z-(--mcq-z-sticky) border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-4 px-4">
        <span className="text-h3 font-bold text-primary">{t('common.appName')}</span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher
            target={locale === 'bn' ? 'en' : 'bn'}
            label={t('locale.switchLabel')}
            text={t('locale.switchTo')}
          />
          <ThemeToggle
            labels={{ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }}
          />
        </div>
      </div>
    </header>
  );
}
