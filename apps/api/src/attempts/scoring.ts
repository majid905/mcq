import type { AnswerKey } from '../exams/paper.service';

export interface SectionScore {
  node_id: string;
  label: string;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
}

export interface ScoreResult {
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  sections: SectionScore[];
}

/** Two decimals, avoiding binary float noise (0.1 + 0.2). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Scores one attempt against the answer key. Every question in the key counts: no answer is
 * "skipped" (0 marks), a wrong answer costs `negative_mark`. Answers for questions that are not in
 * the key are ignored.
 */
export function scoreAttempt(key: AnswerKey, answers: Record<string, string>): ScoreResult {
  const sections = new Map<string, SectionScore>(
    key.sections.map((s) => [
      s.node_id,
      { node_id: s.node_id, label: s.label, correct: 0, wrong: 0, skipped: 0, score: 0 },
    ]),
  );
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  for (const [qid, right] of Object.entries(key.correct)) {
    const section = sections.get(key.section[qid] ?? '0');
    const given = answers[qid];
    if (given === undefined) {
      skipped++;
      if (section) section.skipped++;
    } else if (given === right) {
      correct++;
      if (section) {
        section.correct++;
        section.score += key.mark_per_question;
      }
    } else {
      wrong++;
      if (section) {
        section.wrong++;
        section.score -= key.negative_mark;
      }
    }
  }
  const score = round2(correct * key.mark_per_question - wrong * key.negative_mark);
  return {
    correct,
    wrong,
    skipped,
    score,
    sections: [...sections.values()].map((s) => ({ ...s, score: round2(s.score) })),
  };
}

/**
 * Leaderboard sort value (docs/02 section 4): higher score first, then less time taken. Equal
 * score and time share the value; ZSET order between them is then by member, and the final merit
 * pass breaks that last tie by earlier submission.
 */
export function leaderboardScore(score: number, durationSec: number, timeTakenSec: number): number {
  return score * 1e7 + Math.max(0, durationSec - timeTakenSec);
}

/** "You beat X% of participants". */
export function percentile(rank: number, participants: number): number {
  if (participants <= 1) return 0;
  return round2(((participants - rank) / participants) * 100);
}
