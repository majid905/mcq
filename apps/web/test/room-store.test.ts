import { describe, expect, it } from 'vitest';
import { buildRoomPaper } from '../lib/exam/paper';
import { getRoomStore, whenHydrated } from '../lib/exam/room-store';

const paper = buildRoomPaper(
  {
    exam_id: '1',
    version: 1,
    sections: [{ node_id: '1', label: 'A', question_ids: ['q1', 'q2'] }],
    questions: [
      {
        id: 'q1',
        body: 'Q1',
        options: [
          { key: 'a', html: 'A' },
          { key: 'b', html: 'B' },
        ],
      },
      {
        id: 'q2',
        body: 'Q2',
        options: [
          { key: 'a', html: 'A' },
          { key: 'b', html: 'B' },
        ],
      },
    ],
  },
  { shuffle_seed: null, shuffle_questions: false, shuffle_options: false },
);

const start = {
  attempt_id: 'a1',
  kind: 'live' as const,
  server_time: new Date().toISOString(),
  started_at: new Date().toISOString(),
  ends_at: new Date(Date.now() + 60_000).toISOString(),
  saved_answers: { q2: 'b' as const },
};

describe('room store', () => {
  it('starts from saved answers, toggles a selection off on a second tap, counts versions', async () => {
    const store = getRoomStore(`t-${Math.random()}`);
    await whenHydrated(store);
    store.getState().init({ start, examId: '1', paper, mode: 'one', labels: 'bn' });
    const s = () => store.getState();
    expect(s().status).toBe('running');
    expect(s().answers).toEqual({ q2: 'b' });

    s().select('q1', 'a');
    expect(s().answers.q1).toBe('a');
    s().select('q1', 'a');
    expect(s().answers.q1).toBeUndefined();
    expect(s().version).toBe(2);

    s().toggleMark('q2');
    expect(s().marked).toEqual(['q2']);
    s().go(5);
    expect(s().current).toBe(1);
  });

  it('keeps newer local answers when the attempt is resumed', async () => {
    const store = getRoomStore(`t-${Math.random()}`);
    await whenHydrated(store);
    store.getState().init({ start, examId: '1', paper, mode: 'one', labels: 'bn' });
    store.getState().select('q1', 'b');
    store.getState().init({
      start: { ...start, saved_answers: {} },
      examId: '1',
      paper,
      mode: 'omr',
      labels: 'en',
    });
    expect(store.getState().answers).toEqual({ q2: 'b', q1: 'b' });
    expect(store.getState().mode).toBe('one');
  });

  it('ignores answers once submitting', async () => {
    const store = getRoomStore(`t-${Math.random()}`);
    await whenHydrated(store);
    store.getState().init({ start, examId: '1', paper, mode: 'one', labels: 'bn' });
    store.getState().setStatus('submitting');
    store.getState().select('q1', 'a');
    expect(store.getState().answers.q1).toBeUndefined();
  });
});
