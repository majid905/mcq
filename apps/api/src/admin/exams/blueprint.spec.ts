import { shuffle, splitByMix } from './blueprint';

describe('splitByMix', () => {
  it('always adds up to count', () => {
    for (const count of [1, 7, 10, 33, 100]) {
      const parts = splitByMix(count, { easy: 30, medium: 50, hard: 20 });
      expect(parts.reduce((s, p) => s + p.n, 0)).toBe(count);
    }
  });

  it('follows the proportions', () => {
    expect(splitByMix(10, { easy: 3, medium: 5, hard: 2 })).toEqual([
      { band: 'easy', n: 3 },
      { band: 'medium', n: 5 },
      { band: 'hard', n: 2 },
    ]);
  });

  it('gives the leftover to the largest remainder and drops empty bands', () => {
    expect(splitByMix(5, { easy: 1, medium: 1, hard: 1 }).reduce((s, p) => s + p.n, 0)).toBe(5);
    expect(splitByMix(4, { medium: 1 })).toEqual([{ band: 'medium', n: 4 }]);
  });

  it('without a mix there is no band filter', () => {
    expect(splitByMix(12, undefined)).toEqual([{ band: 'any', n: 12 }]);
    expect(splitByMix(12, { easy: 0, medium: 0, hard: 0 })).toEqual([{ band: 'any', n: 12 }]);
  });
});

describe('shuffle', () => {
  it('keeps every item and does not touch the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
