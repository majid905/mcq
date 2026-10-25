import { applyStreak, applyWrongList, dhakaDayOf, isWeak } from './stats-logic';

describe('dhakaDayOf', () => {
  it('rolls over at Dhaka midnight (UTC+6), not UTC midnight', () => {
    expect(dhakaDayOf(new Date('2026-10-25T17:59:59Z'))).toBe('2026-10-25');
    expect(dhakaDayOf(new Date('2026-10-25T18:00:00Z'))).toBe('2026-10-26');
  });
});

describe('applyStreak', () => {
  const fresh = { current: 0, best: 0, lastDay: null };

  it('starts at 1 and counts consecutive days', () => {
    const s = applyStreak(fresh, ['2026-10-23', '2026-10-24', '2026-10-25']);
    expect(s).toEqual({ current: 3, best: 3, lastDay: '2026-10-25' });
  });

  it('same day twice changes nothing', () => {
    const s = applyStreak({ current: 4, best: 6, lastDay: '2026-10-25' }, ['2026-10-25']);
    expect(s).toEqual({ current: 4, best: 6, lastDay: '2026-10-25' });
  });

  it('continues from yesterday', () => {
    const s = applyStreak({ current: 4, best: 4, lastDay: '2026-10-24' }, ['2026-10-25']);
    expect(s).toEqual({ current: 5, best: 5, lastDay: '2026-10-25' });
  });

  it('a gap resets to 1 but keeps the best', () => {
    const s = applyStreak({ current: 9, best: 9, lastDay: '2026-10-20' }, ['2026-10-25']);
    expect(s).toEqual({ current: 1, best: 9, lastDay: '2026-10-25' });
  });

  it('ignores late events older than the last day and handles unordered input', () => {
    const s = applyStreak({ current: 2, best: 2, lastDay: '2026-10-25' }, [
      '2026-10-26',
      '2026-10-10',
      '2026-10-25',
    ]);
    expect(s).toEqual({ current: 3, best: 3, lastDay: '2026-10-26' });
  });

  it('works across a month end', () => {
    const s = applyStreak({ current: 1, best: 1, lastDay: '2026-10-31' }, ['2026-11-01']);
    expect(s.current).toBe(2);
  });
});

describe('applyWrongList', () => {
  it('a wrong answer adds the question and counts repeats', () => {
    expect(applyWrongList(null, false)).toEqual({ wrongTimes: 1, correctStreak: 0 });
    expect(applyWrongList({ wrongTimes: 1, correctStreak: 1 }, false)).toEqual({
      wrongTimes: 2,
      correctStreak: 0,
    });
  });

  it('a correct answer on a question that is not listed does nothing', () => {
    expect(applyWrongList(null, true)).toBeNull();
  });

  it('two correct answers in a row remove it, a wrong one in between resets the count', () => {
    const one = applyWrongList({ wrongTimes: 2, correctStreak: 0 }, true);
    expect(one).toEqual({ wrongTimes: 2, correctStreak: 1 });
    expect(applyWrongList(one, true)).toBeNull();
    const reset = applyWrongList(one, false);
    expect(reset).toEqual({ wrongTimes: 3, correctStreak: 0 });
  });
});

describe('isWeak', () => {
  it('needs 10 attempts and under 50 percent', () => {
    expect(isWeak(9, 0)).toBe(false);
    expect(isWeak(10, 4)).toBe(true);
    expect(isWeak(10, 5)).toBe(false);
  });
});
