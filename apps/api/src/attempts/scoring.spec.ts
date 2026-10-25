import type { AnswerKey } from '../exams/paper.service';
import { orderMerit } from './merit.service';
import { leaderboardScore, percentile, scoreAttempt } from './scoring';
import { parseSubmit } from './scoring.service';

const key: AnswerKey = {
  correct: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' },
  section: { '1': '10', '2': '10', '3': '20', '4': '20' },
  sections: [
    { node_id: '10', label: 'বাংলা' },
    { node_id: '20', label: 'গণিত' },
  ],
  mark_per_question: 1,
  negative_mark: 0.25,
  total_marks: 4,
};

describe('scoreAttempt', () => {
  it('adds marks for right answers and deducts negative marks for wrong ones', () => {
    const r = scoreAttempt(key, { '1': 'a', '2': 'x', '3': 'c' });
    expect(r).toMatchObject({ correct: 2, wrong: 1, skipped: 1, score: 1.75 });
  });

  it('skipped questions cost nothing; nothing answered scores 0', () => {
    expect(scoreAttempt(key, {})).toMatchObject({ correct: 0, wrong: 0, skipped: 4, score: 0 });
  });

  it('can go below zero with negative marking', () => {
    const r = scoreAttempt(key, { '1': 'b', '2': 'a', '3': 'a', '4': 'a' });
    expect(r.score).toBe(-1);
  });

  it('ignores answers for questions that are not in the paper', () => {
    const r = scoreAttempt(key, { '1': 'a', '999': 'a' });
    expect(r.correct + r.wrong + r.skipped).toBe(4);
    expect(r.score).toBe(1);
  });

  it('builds the section breakdown', () => {
    const r = scoreAttempt(key, { '1': 'a', '2': 'a', '3': 'c', '4': 'd' });
    expect(r.sections).toEqual([
      { node_id: '10', label: 'বাংলা', correct: 1, wrong: 1, skipped: 0, score: 0.75 },
      { node_id: '20', label: 'গণিত', correct: 2, wrong: 0, skipped: 0, score: 2 },
    ]);
  });

  it('does not accumulate float noise (0.1 steps)', () => {
    const k: AnswerKey = { ...key, negative_mark: 0.1 };
    expect(scoreAttempt(k, { '1': 'b', '2': 'a', '3': 'a' }).score).toBe(-0.3);
  });
});

describe('leaderboardScore + percentile', () => {
  it('higher score wins, then less time', () => {
    const fast = leaderboardScore(40, 3600, 1200);
    const slow = leaderboardScore(40, 3600, 3000);
    const better = leaderboardScore(41, 3600, 3599);
    expect(fast).toBeGreaterThan(slow);
    expect(better).toBeGreaterThan(fast);
  });

  it('percentile is the share of participants behind you', () => {
    expect(percentile(1, 100)).toBe(99);
    expect(percentile(50, 100)).toBe(50);
    expect(percentile(100, 100)).toBe(0);
    expect(percentile(1, 1)).toBe(0);
  });
});

describe('orderMerit tie-breaks (FR-RES-06)', () => {
  it('same score and time: the earlier submission ranks first', () => {
    const rows = [
      { userId: 1n, value: 100, submittedMs: 5000 },
      { userId: 2n, value: 100, submittedMs: 4000 },
      { userId: 3n, value: 120, submittedMs: 9000 },
    ];
    expect(orderMerit(rows).map((r) => r.userId)).toEqual([3n, 2n, 1n]);
  });
});

describe('parseSubmit', () => {
  const fields = (o: Record<string, string>) => Object.entries(o).flat();

  it('reads a well-formed entry', () => {
    const m = parseSubmit(
      '1-0',
      fields({
        attempt_id: '7',
        user_id: '9',
        exam_id: '5',
        kind: 'live',
        district_id: '3',
        started_ms: '1000',
        submitted_ms: '2000',
      }),
    );
    expect(m).toMatchObject({ attemptId: 7n, userId: 9n, examId: 5n, districtId: '3' });
  });

  it('rejects poison entries', () => {
    expect(parseSubmit('1-0', fields({ attempt_id: 'x', user_id: '9' }))).toBeNull();
    expect(
      parseSubmit(
        '1-0',
        fields({ attempt_id: '1', user_id: '9', started_ms: 'a', submitted_ms: '1' }),
      ),
    ).toBeNull();
  });
});
