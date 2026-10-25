import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaperService, type AnswerKey } from '../exams/paper.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { answersKey, extraKey, SUBMIT_STREAM, ATTEMPT_TTL_SEC } from './attempt-state';
import { leaderboardScore, scoreAttempt } from './scoring';

export const SCORING_GROUP = 'scorers';
export const STATS_STREAM = 'q:stats';
export const lbKey = (examId: bigint | string) => `lb:${examId}`;
export const lbDistrictKey = (examId: bigint | string, districtId: string) =>
  `lb:${examId}:d:${districtId}`;

export interface SubmitMessage {
  streamId: string;
  attemptId: bigint;
  userId: bigint;
  examId: bigint | null;
  kind: string;
  districtId: string | null;
  startedMs: number;
  submittedMs: number;
}

/** Parses the flat field list of a `q:submit` entry; null when it is malformed (poison message). */
export function parseSubmit(streamId: string, fields: string[]): SubmitMessage | null {
  const f: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) f[fields[i] as string] = fields[i + 1] as string;
  if (!/^\d+$/.test(f.attempt_id ?? '') || !/^\d+$/.test(f.user_id ?? '')) return null;
  const startedMs = Number(f.started_ms);
  const submittedMs = Number(f.submitted_ms);
  if (!Number.isFinite(startedMs) || !Number.isFinite(submittedMs)) return null;
  return {
    streamId,
    attemptId: BigInt(f.attempt_id as string),
    userId: BigInt(f.user_id as string),
    examId: f.exam_id ? BigInt(f.exam_id) : null,
    kind: f.kind ?? 'live',
    districtId: f.district_id ? f.district_id : null,
    startedMs,
    submittedMs,
  };
}

interface Scored {
  msg: SubmitMessage;
  answers: Record<string, string>;
  focusLoss: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  sections: string;
  timeTaken: number;
  totalQuestions: number;
}

/**
 * Turns `q:submit` entries into scored `attempts` rows (docs/02 section 4). Safe to run twice on
 * the same entry: the write is an upsert with the same values and the leaderboard ZADD is idempotent.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly papers: PaperService,
  ) {}

  /** Scores and persists a batch. Returns the stream ids that are safe to acknowledge. */
  async processBatch(messages: SubmitMessage[]): Promise<string[]> {
    if (messages.length === 0) return [];
    const keys = new Map<string, AnswerKey | null>();
    const durations = new Map<string, number>();
    const scored: Scored[] = [];
    const done: string[] = [];

    // Answers + extras for the whole batch in two round trips.
    const pipe = this.redis.client.pipeline();
    for (const m of messages) {
      pipe.hgetall(answersKey(m.attemptId));
      pipe.hgetall(extraKey(m.attemptId));
    }
    const fetched = (await pipe.exec()) ?? [];

    for (const [i, m] of messages.entries()) {
      const answers = (fetched[i * 2]?.[1] ?? {}) as Record<string, string>;
      const extra = (fetched[i * 2 + 1]?.[1] ?? {}) as Record<string, string>;
      if (m.examId === null) {
        done.push(m.streamId); // practice/custom attempts are scored by the practice flow
        continue;
      }
      const examKey = String(m.examId);
      if (!keys.has(examKey)) {
        keys.set(examKey, await this.papers.getKey(m.examId).catch(() => null));
        const exam = await this.prisma.exams.findUnique({
          where: { id: m.examId },
          select: { duration_sec: true },
        });
        durations.set(examKey, exam?.duration_sec ?? 0);
      }
      const key = keys.get(examKey);
      if (!key) {
        this.logger.error(`no answer key for exam=${examKey}, attempt=${m.attemptId} stays queued`);
        continue;
      }
      const result = scoreAttempt(key, answers);
      const duration = durations.get(examKey) ?? 0;
      const taken = Math.max(0, Math.round((m.submittedMs - m.startedMs) / 1000));
      scored.push({
        msg: m,
        answers,
        focusLoss: Number(extra.focus_loss ?? 0) || 0,
        correct: result.correct,
        wrong: result.wrong,
        skipped: result.skipped,
        score: result.score,
        sections: JSON.stringify(result.sections),
        timeTaken: duration > 0 ? Math.min(taken, duration) : taken,
        totalQuestions: Object.keys(key.correct).length,
      });
    }

    await this.persist(scored);
    await this.updateLeaderboards(scored, durations);
    const stats = this.redis.client.pipeline();
    for (const s of scored) {
      stats.xadd(
        STATS_STREAM,
        'MAXLEN',
        '~',
        1_000_000,
        '*',
        'attempt_id',
        String(s.msg.attemptId),
        'user_id',
        String(s.msg.userId),
        'exam_id',
        String(s.msg.examId),
      );
      done.push(s.msg.streamId);
    }
    await stats.exec();
    return done;
  }

  /** Upsert in chunks of 500 (docs/03 rule 3). The key is (id, started_at) so partitions prune. */
  private async persist(rows: Scored[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const values = chunk.map(
        (r) => Prisma.sql`(
          ${r.msg.attemptId}, ${r.msg.userId}, ${r.msg.examId}, ${r.msg.kind},
          ${JSON.stringify(r.answers)}, 'scored', ${new Date(r.msg.startedMs)},
          ${new Date(r.msg.submittedMs)}, ${r.timeTaken}, ${r.totalQuestions},
          ${r.correct}, ${r.wrong}, ${r.skipped}, ${r.score}, ${r.sections}, ${r.focusLoss}
        )`,
      );
      await this.prisma.$executeRaw`
        INSERT INTO attempts (
          id, user_id, exam_id, kind, answers, status, started_at, submitted_at, time_taken_sec,
          total_questions, correct_count, wrong_count, skipped_count, score, section_scores,
          focus_loss_count
        ) VALUES ${Prisma.join(values)}
        ON DUPLICATE KEY UPDATE
          answers = VALUES(answers), status = VALUES(status), submitted_at = VALUES(submitted_at),
          time_taken_sec = VALUES(time_taken_sec), correct_count = VALUES(correct_count),
          wrong_count = VALUES(wrong_count), skipped_count = VALUES(skipped_count),
          score = VALUES(score), section_scores = VALUES(section_scores),
          focus_loss_count = VALUES(focus_loss_count)`;
    }
  }

  /** Only ranked live attempts are on the leaderboard. */
  private async updateLeaderboards(rows: Scored[], durations: Map<string, number>): Promise<void> {
    const ranked = rows.filter((r) => r.msg.kind === 'live' && r.msg.examId !== null);
    if (ranked.length === 0) return;
    const pipe = this.redis.client.pipeline();
    const seen = new Set<string>();
    for (const r of ranked) {
      const examId = String(r.msg.examId);
      const value = leaderboardScore(r.score, durations.get(examId) ?? 0, r.timeTaken);
      const member = String(r.msg.userId);
      pipe.zadd(lbKey(examId), value, member);
      if (r.msg.districtId) {
        pipe.zadd(lbDistrictKey(examId, r.msg.districtId), value, member);
        pipe.expire(lbDistrictKey(examId, r.msg.districtId), ATTEMPT_TTL_SEC * 4);
      }
      seen.add(examId);
    }
    for (const examId of seen) {
      pipe.expire(lbKey(examId), ATTEMPT_TTL_SEC * 4);
    }
    await pipe.exec();
  }
}

export { SUBMIT_STREAM };
