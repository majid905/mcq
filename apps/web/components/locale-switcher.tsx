'use client';

import { Languages } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { Link, usePathname } from '@/i18n/navigation';

export function LocaleSwitcher({
  target,
  label,
  text,
}: {
  target: Locale;
  label: string;
  text: string;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={pathname}
      locale={target}
      aria-label={label}
      data-testid="locale-switcher"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-body-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text"
    >
      <Languages aria-hidden size={18} strokeWidth={1.75} />
      <span lang={target}>{text}</span>
    </Link>
  );
}
