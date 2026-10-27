export type Band = 'easy' | 'medium' | 'hard';

/** Difficulty 1-2 easy, 3 medium, 4-5 hard. */
export const BAND_RANGE: Record<Band, [number, number]> = {
  easy: [1, 2],
  medium: [3, 3],
  hard: [4, 5],
};

export interface Rule {
  node_id: string;
  count: number;
  difficulty_mix?: {
    easy?: number | undefined;
    medium?: number | undefined;
    hard?: number | undefined;
  };
}

/**
 * Splits `count` questions over easy/medium/hard in proportion to the mix weights (largest remainder,
 * so the parts always add up to `count`). No mix = no band filter, reported as a single `any` part.
 */
export function splitByMix(
  count: number,
  mix: Rule['difficulty_mix'],
): { band: Band | 'any'; n: number }[] {
  const weights = (['easy', 'medium', 'hard'] as const).map((b) => ({
    band: b,
    w: Math.max(0, mix?.[b] ?? 0),
  }));
  const total = weights.reduce((s, x) => s + x.w, 0);
  if (total === 0) return [{ band: 'any', n: count }];
  const raw = weights.map((x) => ({ band: x.band, exact: (x.w / total) * count }));
  const parts = raw.map((x) => ({ band: x.band, n: Math.floor(x.exact), rem: x.exact % 1 }));
  let left = count - parts.reduce((s, x) => s + x.n, 0);
  for (const p of [...parts].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    p.n += 1;
    left -= 1;
  }
  return parts.filter((p) => p.n > 0).map((p) => ({ band: p.band, n: p.n }));
}

/** Fisher-Yates with an injectable random source (tests pass a seeded one). */
export function shuffle<T>(items: T[], rnd: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
