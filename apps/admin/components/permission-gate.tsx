'use client';

import { EmptyState, Skeleton } from '@mcq/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { can } from '@/lib/permissions';
import { useAdminMe } from '@/lib/queries';

/** The API enforces permissions; this only avoids showing a screen the role cannot use. */
export function PermissionGate({
  permission,
  children,
}: {
  permission: string | null;
  children: ReactNode;
}) {
  const t = useTranslations('common');
  const me = useAdminMe();
  if (me.isPending) return <Skeleton aria-busy className="h-64 rounded-lg" />;
  if (!can(me.data?.permissions, permission)) {
    return (
      <div className="rounded-lg border border-border bg-surface" data-testid="forbidden">
        <EmptyState title={t('forbiddenTitle')} description={t('forbiddenBody')} />
      </div>
    );
  }
  return <>{children}</>;
}
