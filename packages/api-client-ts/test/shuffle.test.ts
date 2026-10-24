import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fisherYates, mulberry32, shufflePaper } from '../src/shuffle';

interface Vector {
  seed: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  first_floats: number[];
  sections: string[][];
  options: Record<string, string[]>;
}
interface VectorFile {
  paper: {
    sections: { node_id: string; question_ids: string[] }[];
    options: Record<string, string[]>;
  };
  vectors: Vector[];
}

const file = JSON.parse(
  readFileSync(new URL('../../api-contract/shuffle-vectors.json', import.meta.url), 'utf8'),
) as VectorFile;

describe('shuffle vectors (shared with Dart)', () => {
  it('has 10 vectors', () => {
    expect(file.vectors).toHaveLength(10);
  });

  it.each(file.vectors.map((v) => [v.seed, v] as const))(
    'seed %i: mulberry32 floats',
    (_seed, v) => {
      const rnd = mulberry32(v.seed);
      expect(v.first_floats.map(() => rnd())).toEqual(v.first_floats);
    },
  );

  it.each(file.vectors.map((v) => [v.seed, v] as const))('seed %i: paper order', (_seed, v) => {
    const result = shufflePaper({
      sections: file.paper.sections,
      options: file.paper.options,
      seed: v.seed,
      shuffleQuestions: v.shuffle_questions,
      shuffleOptions: v.shuffle_options,
    });
    expect(result.sections).toEqual(v.sections);
    expect(result.options).toEqual(v.options);
  });
});

describe('shuffle properties', () => {
  it('does not mutate input and keeps all items', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const out = shufflePaper({
      sections: [{ question_ids: ids }],
      options: {},
      seed: 99,
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    expect([...(out.sections[0] ?? [])].sort()).toEqual(ids);
  });

  it('fisherYates handles empty and single lists', () => {
    const rnd = mulberry32(1);
    expect(fisherYates([], rnd)).toEqual([]);
    expect(fisherYates(['x'], rnd)).toEqual(['x']);
  });
});
