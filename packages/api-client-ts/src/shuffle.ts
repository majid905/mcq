/**
 * Deterministic shuffle shared with the Dart client (docs/04-API.md section 6).
 * Both implementations must pass packages/api-contract/shuffle-vectors.json.
 */

/** Returns a function producing floats in [0, 1) from a uint32 seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place Fisher-Yates, i from len-1 down to 1. */
export function fisherYates<T>(list: T[], rnd: () => number): T[] {
  for (let i = list.length - 1; i >= 1; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = list[i] as T;
    list[i] = list[j] as T;
    list[j] = tmp;
  }
  return list;
}

export interface ShuffleInput {
  sections: { question_ids: string[] }[];
  /** question id -> option keys in original order */
  options: Record<string, string[]>;
  seed: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export interface ShuffleResult {
  sections: string[][];
  options: Record<string, string[]>;
}

/**
 * One PRNG stream: questions of each section first (section order), then options
 * of every question in the final question order. Input is not mutated.
 */
export function shufflePaper(input: ShuffleInput): ShuffleResult {
  const rnd = mulberry32(input.seed);
  const sections = input.sections.map((s) => [...s.question_ids]);
  if (input.shuffleQuestions) {
    for (const ids of sections) fisherYates(ids, rnd);
  }
  const options: Record<string, string[]> = {};
  for (const ids of sections) {
    for (const id of ids) {
      const keys = [...(input.options[id] ?? [])];
      options[id] = input.shuffleOptions ? fisherYates(keys, rnd) : keys;
    }
  }
  return { sections, options };
}
