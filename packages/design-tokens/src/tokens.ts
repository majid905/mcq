import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const TOKENS_PATH = join(REPO_ROOT, 'design', 'tokens.json');

export type Mode = 'light' | 'dark';
export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

export interface OptionStyle {
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
}

/** Shape of design/tokens.json. Keys starting with `$` are comments and are skipped. */
export interface Tokens {
  color: Record<Mode, Record<string, string>>;
  option: Record<OptionState, OptionStyle>;
  font: {
    family: {
      bangla: string;
      latin: string;
      mono: string;
      stackWeb: string;
      flutterFallback: string[];
    };
    weight: Record<string, number>;
    size: Record<string, number>;
    lineHeight: Record<string, number>;
  };
  space: Record<string, number>;
  radius: Record<string, number>;
  border: Record<string, number>;
  shadow: Record<string, string>;
  motion: {
    duration: Record<string, number>;
    easing: Record<string, string>;
  };
  size: Record<string, number>;
  breakpoint: Record<string, number>;
  zIndex: Record<string, number>;
}

export const OPTION_STATES: OptionState[] = ['idle', 'selected', 'correct', 'wrong', 'missed'];

export function loadTokens(path = TOKENS_PATH): Tokens {
  return JSON.parse(readFileSync(path, 'utf8')) as Tokens;
}

/** Entries of a token group without `$description` / `$note` comments. */
export function entries<T>(group: Record<string, T>): [string, T][] {
  return Object.entries(group).filter(([key]) => !key.startsWith('$'));
}

/** `surfaceMuted` -> `surface-muted`, `h1` -> `h1`, `bodySm` -> `body-sm`. */
export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
