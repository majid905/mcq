import { EmptyState } from '@mcq/ui';
import { getTranslations } from 'next-intl/server';

/** Nav targets built in later phases (prompts 21, 30). */
export async function ComingSoon({
  titleKey,
}: {
  titleKey: 'exams' | 'practice' | 'analytics' | 'notifications' | 'search' | 'bookmarks' | 'bank';
}) {
  const t = await getTranslations();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-bold text-text">{t(`nav.${titleKey}`)}</h1>
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState title={t('comingSoon.title')} description={t('comingSoon.body')} />
      </div>
    </div>
  );
}
