import { ThemeToggle } from '@mcq/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { LocaleSwitcher } from './locale-switcher';

/** Language switch + theme toggle, for every header. */
export async function HeaderControls({ compact }: { compact?: boolean }) {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <div className="flex items-center gap-2">
      {/* useSearchParams inside needs a boundary on statically rendered pages. */}
      <Suspense>
        <LocaleSwitcher
          target={locale === 'bn' ? 'en' : 'bn'}
          label={t('locale.switchLabel')}
          text={t('locale.switchTo')}
          compact={compact}
        />
      </Suspense>
      <ThemeToggle
        labels={{ system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') }}
      />
    </div>
  );
}
