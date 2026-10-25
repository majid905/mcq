'use client';

import { cn } from '@mcq/ui';
import { Languages } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import type { Locale } from '@/i18n/routing';
import { Link, usePathname } from '@/i18n/navigation';

export function LocaleSwitcher({
  target,
  label,
  text,
  compact,
}: {
  target: Locale;
  label: string;
  text: string;
  /** Icon only below sm. */
  compact?: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = Object.fromEntries(search.entries());
  return (
    <Link
      href={{ pathname, query }}
      locale={target}
      aria-label={label}
      data-testid="locale-switcher"
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-body-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text"
    >
      <Languages aria-hidden size={18} strokeWidth={1.75} />
      <span lang={target} className={cn(compact && 'max-sm:sr-only')}>
        {text}
      </span>
    </Link>
  );
}
