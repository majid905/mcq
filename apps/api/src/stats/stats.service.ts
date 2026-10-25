import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { applyStreak, applyWrongList, dhakaDayOf, type WrongState } from './stats-logic';

export const STATS_GROUP = 'stats';
export const STATS_STREAM = 'q:stats';
export const seenKey = (userId: bigint | string) => `seen:${userId}`;
const SEEN_TTL_SEC = 120 * 86_400;

/** One answered question, resolved to its topic. */
export interface AnsweredQuestion {
  questionId: bigint;
  nodeId: number;
  correct: boolean;
}

/** One unit of learning activity: a finished attempt or a single quick-practice answer. */
export interface StatEvent {
  userId: bigint;
  /** epoch ms of the activity (Dhaka day buckets use it) */
  at: number;
  answers: AnsweredQuestion[];
  /** true for a finished exam/custom attempt: bumps the day's `exams` counter */
  exam: boolean;
}

const chunks = <T>(list: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

/**
 * Applies learning activity to the rollup tables (docs/03 section 5): per-topic accuracy, per-day
 * counters, streaks (Dhaka days), question difficulty counters, the wrong-answer list and the
 * "seen" set used by "exclude seen questions". One call handles a whole batch of events.
 */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async apply(events: StatEvent[]): Promise<void> {
    const withAnswers = events.filter((e) => e.answers.length > 0);
    if (withAnswers.length === 0) return;
    const ordered = [...withAnswers].sort((a, b) => a.at - b.at);

    // ---- aggregate in memory
    const topics = new Map<
      string,
      { userId: bigint; nodeId: number; attempted: number; correct: number; lastAt: number }
    >();
    const days = new Map<
      string,
      { userId: bigint; day: string; answered: number; correct: number; exams: number }
    >();
    const questions = new Map<bigint, { answered: number; correct: number }>();
    const userDays = new Map<bigint, Set<string>>();
    const seen = new Map<bigint, Set<bigint>>();

    for (const ev of ordered) {
      const day = dhakaDayOf(ev.at);
      const dayKey = `${ev.userId}:${day}`;
      const d = days.get(dayKey) ?? {
        userId: ev.userId,
        day,
        answered: 0,
        correct: 0,
        exams: 0,
      };
      if (ev.exam) d.exams += 1;
      days.set(dayKey, d);
      (userDays.get(ev.userId) ?? userDays.set(ev.userId, new Set()).get(ev.userId))?.add(day);

      for (const a of ev.answers) {
        const tk = `${ev.userId}:${a.nodeId}`;
        const t = topics.get(tk) ?? {
          userId: ev.userId,
          nodeId: a.nodeId,
          attempted: 0,
          correct: 0,
          lastAt: 0,
        };
        t.attempted += 1;
        if (a.correct) t.correct += 1;
        t.lastAt = Math.max(t.lastAt, ev.at);
        topics.set(tk, t);

        d.answered += 1;
        if (a.correct) d.correct += 1;

        const q = questions.get(a.questionId) ?? { answered: 0, correct: 0 };
        q.answered += 1;
        if (a.correct) q.correct += 1;
        questions.set(a.questionId, q);

        (seen.get(ev.userId) ?? seen.set(ev.userId, new Set()).get(ev.userId))?.add(a.questionId);
      }
    }

    // ---- write
    await this.prisma.$transaction(async (tx) => {
      for (const part of chunks([...topics.values()], 500)) {
        const values = part.map(
          (t) =>
            Prisma.sql`(${t.userId}, ${t.nodeId}, ${t.attempted}, ${t.correct}, ${new Date(t.lastAt)})`,
        );
        await tx.$executeRaw`
          INSERT INTO user_topic_stats (user_id, node_id, attempted, correct, last_at)
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE attempted = attempted + VALUES(attempted),
            correct = correct + VALUES(correct), last_at = GREATEST(COALESCE(last_at, VALUES(last_at)), VALUES(last_at))`;
      }
      for (const part of chunks([...days.values()], 500)) {
        const values = part.map(
          (d) =>
            Prisma.sql`(${d.userId}, ${d.day}, ${d.answered}, ${d.correct}, ${d.exams}, ${d.correct})`,
        );
        await tx.$executeRaw`
          INSERT INTO user_daily_stats (user_id, day, answered, correct, exams, points)
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE answered = answered + VALUES(answered),
            correct = correct + VALUES(correct), exams = exams + VALUES(exams),
            points = points + VALUES(points)`;
      }
      for (const part of chunks([...questions.entries()], 500)) {
        const ids = part.map(([id]) => id);
        const answered = Prisma.join(
          part.map(([id, v]) => Prisma.sql`WHEN ${id} THEN ${v.answered}`),
          ' ',
        );
        const correct = Prisma.join(
          part.map(([id, v]) => Prisma.sql`WHEN ${id} THEN ${v.correct}`),
          ' ',
        );
        await tx.$executeRaw`
          UPDATE questions SET
            times_answered = times_answered + CASE id ${answered} ELSE 0 END,
            times_correct = times_correct + CASE id ${correct} ELSE 0 END
          WHERE id IN (${Prisma.join(ids)})`;
      }

      // Streaks: one row per user.
      const userIds = [...userDays.keys()];
      const streakRows = await tx.user_streaks.findMany({ where: { user_id: { in: userIds } } });
      const streakBy = new Map(streakRows.map((r) => [r.user_id, r]));
      for (const [userId, dayset] of userDays) {
        const row = streakBy.get(userId);
        const next = applyStreak(
          {
            current: row?.current_streak ?? 0,
            best: row?.best_streak ?? 0,
            lastDay: row?.last_day?.toISOString().slice(0, 10) ?? null,
          },
          dayset,
        );
        await tx.$executeRaw`
          INSERT INTO user_streaks (user_id, current_streak, best_streak, last_day)
          VALUES (${userId}, ${next.current}, ${next.best}, ${next.lastDay})
          ON DUPLICATE KEY UPDATE current_streak = VALUES(current_streak),
            best_streak = VALUES(best_streak), last_day = VALUES(last_day)`;
      }

      await this.updateWrongList(tx, ordered);
    });

    // The "seen" sets are advisory (only used to skip repeats), so Redis is updated after commit.
    const pipe = this.redis.client.pipeline();
    for (const [userId, ids] of seen) {
      pipe.sadd(seenKey(userId), ...[...ids].map(String));
      pipe.expire(seenKey(userId), SEEN_TTL_SEC);
    }
    await pipe.exec();
    this.logger.debug(`stats applied events=${ordered.length}`);
  }

  private async updateWrongList(tx: Prisma.TransactionClient, ordered: StatEvent[]) {
    const pairs = new Map<string, { userId: bigint; questionId: bigint }>();
    for (const ev of ordered) {
      for (const a of ev.answers) {
        pairs.set(`${ev.userId}:${a.questionId}`, { userId: ev.userId, questionId: a.questionId });
      }
    }
    const list = [...pairs.values()];
    const state = new Map<string, WrongState | null>();
    for (const part of chunks(list, 500)) {
      const rows = await tx.user_wrong_questions.findMany({
        where: { OR: part.map((p) => ({ user_id: p.userId, question_id: p.questionId })) },
      });
      for (const r of rows) {
        state.set(`${r.user_id}:${r.question_id}`, {
          wrongTimes: r.wrong_times,
          correctStreak: r.correct_streak,
        });
      }
    }
    const lastWrongAt = new Map<string, number>();
    for (const ev of ordered) {
      for (const a of ev.answers) {
        const key = `${ev.userId}:${a.questionId}`;
        state.set(key, applyWrongList(state.get(key) ?? null, a.correct));
        if (!a.correct) lastWrongAt.set(key, ev.at);
      }
    }
    for (const [key, next] of state) {
      const { userId, questionId } = pairs.get(key) ?? {};
      if (userId === undefined || questionId === undefined) continue;
      if (next === null) {
        await tx.user_wrong_questions.deleteMany({
          where: { user_id: userId, question_id: questionId },
        });
      } else {
        const at = new Date(lastWrongAt.get(key) ?? Date.now());
        await tx.$executeRaw`
          INSERT INTO user_wrong_questions (user_id, question_id, wrong_times, correct_streak, last_wrong_at)
          VALUES (${userId}, ${questionId}, ${next.wrongTimes}, ${next.correctStreak}, ${at})
          ON DUPLICATE KEY UPDATE wrong_times = VALUES(wrong_times),
            correct_streak = VALUES(correct_streak),
            last_wrong_at = IF(VALUES(correct_streak) = 0, VALUES(last_wrong_at), last_wrong_at)`;
      }
    }
  }
}
