import type { Mode, Tokens } from './tokens';
import { OPTION_STATES } from './tokens';

export const MIN_TEXT_CONTRAST = 4.5;

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Expected #RRGGBB, got "${hex}"`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** [foreground, background] colour names. Every pair that renders text in the UI belongs here. */
export const TEXT_PAIRS: [string, string][] = [
  ...['text', 'textMuted', 'textSubtle'].flatMap((fg) =>
    ['bg', 'surface', 'surfaceMuted'].map((bg): [string, string] => [fg, bg]),
  ),
  ['text', 'primarySoft'],
  ['text', 'accentSoft'],
  ['textMuted', 'surfaceSunken'],
  ['primary', 'bg'],
  ['primary', 'surface'],
  ['primary', 'primarySoft'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'primaryHover'],
  ['onAccent', 'accent'],
  ['accentText', 'accentSoft'],
  ['accentText', 'surface'],
  ['live', 'liveSoft'],
  ['live', 'surface'],
  ['success', 'successSoft'],
  ['success', 'surface'],
  ['danger', 'dangerSoft'],
  ['danger', 'surface'],
  ['warning', 'warningSoft'],
  ['info', 'infoSoft'],
  ['onPrimary', 'success'],
  ['onPrimary', 'danger'],
];

export interface PairResult {
  mode: Mode;
  fg: string;
  bg: string;
  ratio: number;
}

/** Contrast of every text pair, plus option tile text and badge text in each state. */
export function checkContrast(tokens: Tokens): PairResult[] {
  const results: PairResult[] = [];
  for (const mode of ['light', 'dark'] as const) {
    const c = tokens.color[mode];
    const pairs: [string, string][] = [
      ...TEXT_PAIRS,
      ...OPTION_STATES.flatMap((s): [string, string][] => [
        ['text', tokens.option[s].bg],
        [tokens.option[s].badgeText, tokens.option[s].badgeBg],
      ]),
    ];
    for (const [fg, bg] of pairs) {
      const fgHex = c[fg];
      const bgHex = c[bg];
      if (!fgHex || !bgHex) throw new Error(`Unknown colour token in pair ${fg}/${bg} (${mode})`);
      results.push({ mode, fg, bg, ratio: contrastRatio(fgHex, bgHex) });
    }
  }
  return results;
}
