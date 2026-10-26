import type { ReactNode } from 'react';
import { AdminShell } from '@/components/shell/admin-shell';

/** Signed-in admin area; middleware.ts sends everyone else to /login. */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
