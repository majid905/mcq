import { describe, expect, it } from 'vitest';
import vectors from '../../../packages/api-contract/shuffle-vectors.json';
import { type Paper, buildRoomPaper } from '../lib/exam/paper';

// A paper built from the shared vectors' sections/options, with option HTML = "<key>-<qid>".
const paper: Paper = {
  exam_id: '5002',
  version: 1,
  sections: vectors.paper.sections.map((s, i) => ({ ...s, label: `S${i + 1}` })),
  questions: Object.entries(vectors.paper.options as Record<string, string[]>).map(
    ([id, keys]) => ({
      id,
      body: `<p>Q${id}</p>`,
      options: keys.map((key) => ({ key: key as 'a', html: `${key}-${id}` })),
    }),
  ),
};

describe('buildRoomPaper', () => {
  it('matches every shared shuffle vector (same order as the app and the server)', () => {
    for (const v of vectors.vectors) {
      const room = buildRoomPaper(paper, {
        shuffle_seed: v.seed,
        shuffle_questions: v.shuffle_questions,
        shuffle_options: v.shuffle_options,
      });
      expect(room.sections.map((s) => s.questionIds)).toEqual(v.sections);
      for (const [qid, keys] of Object.entries(v.options as Record<string, string[]>)) {
        expect(room.questions[qid]!.options.map((o) => o.key)).toEqual(keys);
      }
    }
  });

  it('keeps original keys and HTML together after shuffling options', () => {
    const room = buildRoomPaper(paper, {
      shuffle_seed: 7,
      shuffle_questions: true,
      shuffle_options: true,
    });
    for (const q of Object.values(room.questions)) {
      for (const o of q.options) expect(o.html).toBe(`${o.key}-${q.id}`);
    }
    expect(room.order).toEqual(room.sections.flatMap((s) => s.questionIds));
  });

  it('keeps the paper order without a seed', () => {
    const room = buildRoomPaper(paper, {
      shuffle_seed: null,
      shuffle_questions: true,
      shuffle_options: true,
    });
    expect(room.sections.map((s) => s.questionIds)).toEqual(
      vectors.paper.sections.map((s) => s.question_ids),
    );
    expect(room.sections[0]!.label).toBe('S1');
  });
});
