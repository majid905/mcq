/** `*` is the super admin; otherwise the role must list the exact permission (same rule as the API). */
export function can(granted: readonly string[] | undefined, needed: string | null): boolean {
  if (!needed) return true;
  return Boolean(granted && (granted.includes('*') || granted.includes(needed)));
}

/**
 * Admin navigation (docs/06 L2-L13) with the permission each screen needs. Names follow the
 * seeded roles in database/schema.sql; banners/settings/admins/notifications are super-admin
 * only until roles get those permissions.
 */
export const NAV = [
  { href: '/dashboard', key: 'dashboard', permission: null, group: 'overview' },
  { href: '/questions', key: 'questions', permission: 'questions.read', group: 'content' },
  { href: '/imports', key: 'imports', permission: 'questions.import', group: 'content' },
  { href: '/taxonomy', key: 'taxonomy', permission: 'taxonomy.write', group: 'content' },
  { href: '/reports', key: 'reports', permission: 'reports.read', group: 'content' },
  { href: '/exams', key: 'exams', permission: 'exams.read', group: 'exams' },
  { href: '/users', key: 'users', permission: 'users.read', group: 'people' },
  { href: '/payments', key: 'payments', permission: 'payments.read', group: 'billing' },
  { href: '/packages', key: 'packages', permission: 'packages.write', group: 'billing' },
  { href: '/coupons', key: 'coupons', permission: 'coupons.write', group: 'billing' },
  { href: '/notifications', key: 'notifications', permission: 'notifications.send', group: 'ops' },
  { href: '/banners', key: 'banners', permission: 'banners.write', group: 'ops' },
  { href: '/settings', key: 'settings', permission: 'settings.write', group: 'ops' },
  { href: '/admins', key: 'admins', permission: 'admins.write', group: 'ops' },
] as const;

export type NavKey = (typeof NAV)[number]['key'];
export const NAV_GROUPS = ['overview', 'content', 'exams', 'people', 'billing', 'ops'] as const;
