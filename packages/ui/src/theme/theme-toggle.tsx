'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '../lib/cn';
import {
  type ThemePreference,
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
} from './theme';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export interface ThemeToggleProps {
  /** Accessible names per preference, from the app's messages. */
  labels: Record<ThemePreference, string>;
  className?: string;
}

/** Cycles system → light → dark. The label names the current preference. */
export function ThemeToggle({ labels, className }: ThemeToggleProps) {
  const pref = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => 'system' as const,
  );

  const Icon = ICON[pref];
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-theme-pref={pref}
      aria-label={labels[pref]}
      title={labels[pref]}
      onClick={() => {
        applyThemePreference(NEXT[pref]);
      }}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-md border border-border bg-surface text-text-muted',
        'transition-colors duration-[var(--mcq-duration-fast)] hover:bg-surface-muted hover:text-text',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        className,
      )}
    >
      <Icon aria-hidden size={20} strokeWidth={1.75} />
    </button>
  );
}
