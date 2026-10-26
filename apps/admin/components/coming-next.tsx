import { EmptyState } from '@mcq/ui';
import { getTranslations } from 'next-intl/server';
import { PermissionGate } from './permission-gate';

/** Screens from docs/06 L3-L13 that land in the next pushes; the nav and permissions are final. */
export async function ComingNext({
  titleKey,
  permission,
}: {
  titleKey: string;
  permission: string | null;
}) {
  const t = await getTranslations();
  return (
    <PermissionGate permission={permission}>
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 font-bold text-text">{t(`nav.${titleKey}` as 'nav.dashboard')}</h1>
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState title={t('common.comingTitle')} description={t('common.comingBody')} />
        </div>
      </div>
    </PermissionGate>
  );
}
