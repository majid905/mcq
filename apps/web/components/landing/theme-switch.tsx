'use client';

import {
  type ThemePreference,
  applyThemePreference,
  cn,
  readThemePreference,
  subscribeThemePreference,
} from '@mcq/ui';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  const off = subscribeThemePreference(onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    off();
  };
}

function resolved(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Landing header theme switch (design: a plain moon icon button). Flips between light and dark
 * from whatever is showing now; `variant="menu"` is the labelled full-width button in the mobile
 * menu.
 */
export function ThemeSwitch({
  labels,
  variant = 'icon',
  className,
}: {
  labels: { toDark: string; toLight: string; darkShort: string; lightShort: string };
  variant?: 'icon' | 'menu';
  className?: string;
}) {
  const theme = useSyncExternalStore(
    subscribe,
    () => resolved(readThemePreference()),
    () => 'light' as const,
  );
  const dark = theme === 'dark';
  const Icon = dark ? Sun : Moon;
  const onClick = () => applyThemePreference(dark ? 'light' : 'dark');

  if (variant === 'menu') {
    return (
      <button
        type="button"
        data-testid="theme-toggle"
        onClick={onClick}
        className={cn(
          'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border-[1.5px] border-border-strong font-medium text-text',
          className,
        )}
      >
        <Icon aria-hidden size={20} strokeWidth={2} />
        {dark ? labels.lightShort : labels.darkShort}
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={dark ? labels.toLight : labels.toDark}
      title={dark ? labels.toLight : labels.toDark}
      onClick={onClick}
      className={cn(
        'grid size-11 place-items-center rounded-md text-text-muted transition-colors duration-(--mcq-duration-fast) hover:bg-surface-muted',
        className,
      )}
    >
      <Icon aria-hidden size={20} strokeWidth={2} />
    </button>
  );
}
