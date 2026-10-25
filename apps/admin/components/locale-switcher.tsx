'use client';

import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { Locale } from '@/i18n/locale';
import { setLocale } from '@/lib/set-locale';

export function LocaleSwitcher({
  target,
  label,
  text,
}: {
  target: Locale;
  label: string;
  text: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="locale-switcher"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLocale(target);
          router.refresh();
        })
      }
      className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-body-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-60"
    >
      <Languages aria-hidden size={18} strokeWidth={1.75} />
      <span lang={target}>{text}</span>
    </button>
  );
}
