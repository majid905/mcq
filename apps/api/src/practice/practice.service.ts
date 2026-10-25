import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type users } from '@prisma/client';
import {
  ATTEMPT_TTL_SEC,
  answersKey,
  metaKey,
  metaToHash,
  practiceKeyKey,
  type AttemptMeta,
} from '../attempts/attempt-state';
import { AttemptsService, type AttemptStartDto } from '../attempts/attempts.service';
import { ApiException } from '../common/api-exception';
import { EntitlementService } from '../exams/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { dhakaDayOf } from '../stats/stats-logic';
import { STATS_STREAM, seenKey } from '../stats/stats.service';
import { PoolService } from './pool.service';

export interface PracticeCreateDto {
  mode: 'quick' | 'custom' | 'bookmarks' | 'wrong';
  node_ids?: string[];
  question_count: number;
  duration_sec?: number | null;
  difficulty: 'easy' | 'mixed' | 'hard';
  exclude_seen: boolean;
}

const UNTIMED_SEC = 24 * 3600; // `ends_at` is required by the contract; untimed sessions get a day
const MIN_QUESTIONS = 5;
const quotaKey = (userId: bigint, day: string) => `quota:practice:${userId}:${day}`;

/** Next Dhaka midnight, when the free daily practice limit resets. */
function nextDhakaMidnight(now: Date): Date {
  return new Date(Date.parse(`${dhakaDayOf(now)}T00:00:00Z`) + 86_400_000 - 6 * 3600_000);
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly pools: PoolService,
    private readonly entitlement: EntitlementService,
    private readonly settings: SettingsService,
    private readonly attempts: AttemptsService,
  ) {}

  // ------------------------------------------------------------------ create

  /** FR-PRAC-02, 03, 05, 06. Picks the questions, stores the session and returns it ready to play. */
  async create(
    user: Pick<users, 'id' | 'locale' | 'district_id'>,
    dto: PracticeCreateDto,
  ): Promise<AttemptStartDto> {
    const now = new Date();
    const subscribed = await this.entitlement.hasAnySubscription(user.id, now);
    if (!subscribed) await this.assertQuota(user.id, now, 0);

    const questions = await this.pick(user.id, dto, subscribed, now);
    if (questions.length < MIN_QUESTIONS) {
      throw new ApiException('NOT_ENOUGH_QUESTIONS', {
        found: questions.length,
        needed: MIN_QUESTIONS,
      });
    }
    if (!subscribed)
      await this.countQuota(user.id, now, dto.mode === 'quick' ? 0 : questions.length);

    const kind: AttemptMeta['kind'] = dto.mode === 'quick' ? 'quick_practice' : 'custom';
    const timed = dto.mode !== 'quick' && dto.duration_sec;
    const endsAt = new Date(
      now.getTime() + (timed ? (dto.duration_sec as number) : UNTIMED_SEC) * 1000,
    );
    const seed = kind === 'custom' ? randomInt(1, 2 ** 32) : null;

    const row = await this.prisma.attempts.create({
      data: {
        user_id: user.id,
        exam_id: null,
        kind,
        question_ids: questions.map((q) => String(q.id)),
        started_at: now,
        total_questions: questions.length,
        shuffle_seed: seed,
        district_id: user.district_id,
      },
    });
    const meta: AttemptMeta = {
      user_id: String(user.id),
      exam_id: null,
      kind,
      started_ms: now.getTime(),
      ends_ms: endsAt.getTime(),
      status: 'in_progress',
      total: questions.length,
      district_id: user.district_id === null ? null : String(user.district_id),
    };
    const key = Object.fromEntries(questions.map((q) => [String(q.id), q.correct_option]));
    await this.redis.client
      .multi()
      .hset(metaKey(row.id), metaToHash(meta))
      .expire(metaKey(row.id), ATTEMPT_TTL_SEC)
      .set(practiceKeyKey(row.id), JSON.stringify(key), 'EX', ATTEMPT_TTL_SEC)
      .exec();

    return {
      attempt_id: String(row.id),
      kind,
      server_time: now.toISOString(),
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      paper_url: null,
      paper: {
        exam_id: null,
        version: 1,
        mark_per_question: 1,
        negative_mark: 0,
        sections: [
          {
            node_id: '0',
            label: user.locale === 'en' ? 'Practice' : 'অনুশীলন',
            question_ids: questions.map((q) => String(q.id)),
          },
        ],
        questions: questions.map((q) => ({
          id: String(q.id),
          body: q.body,
          options: q.options as unknown as { key: string; html: string }[],
        })),
      } as unknown as AttemptStartDto['paper'],
      shuffle_seed: seed,
      shuffle_questions: false,
      shuffle_options: kind === 'custom',
      saved_answers: {},
    };
  }

  private async pick(userId: bigint, dto: PracticeCreateDto, subscribed: boolean, now: Date) {
    const want = dto.question_count;
    const exclude = dto.exclude_seen ? await this.redis.client.smembers(seenKey(userId)) : [];
    const excluded = new Set(exclude);
    const difficulty =
      dto.difficulty === 'easy' ? { lte: 2 } : dto.difficulty === 'hard' ? { gte: 4 } : undefined;
    const select = {
      id: true,
      body: true,
      options: true,
      correct_option: true,
      is_premium: true,
      primary_node_id: true,
    } as const;

    // Premium questions are only practised by subscribers (their answer is revealed at once).
    const accept = (q: { is_premium: boolean }) => subscribed || !q.is_premium;
    const chosen = new Map<bigint, Awaited<ReturnType<typeof this.fetch>>[number]>();

    if (dto.mode === 'bookmarks' || dto.mode === 'wrong') {
      const links =
        dto.mode === 'bookmarks'
          ? await this.prisma.bookmarks.findMany({
              where: { user_id: userId },
              orderBy: { created_at: 'desc' },
              take: 1000,
              select: { question_id: true },
            })
          : await this.prisma.user_wrong_questions.findMany({
              where: { user_id: userId },
              orderBy: { last_wrong_at: 'desc' },
              take: 1000,
              select: { question_id: true },
            });
      const ids = shuffle(links.map((l) => l.question_id)).slice(0, want * 2);
      for (const q of await this.fetch(ids, select, difficulty)) {
        if (accept(q) && chosen.size < want) chosen.set(q.id, q);
      }
      return [...chosen.values()];
    }

    const nodeIds = [...new Set((dto.node_ids ?? []).map(Number))];
    if (nodeIds.length === 0)
      throw new ApiException('VALIDATION_FAILED', { fields: { node_ids: 'required' } });
    const known = await this.prisma.taxonomy_nodes.count({
      where: { id: { in: nodeIds }, is_active: true },
    });
    if (known !== nodeIds.length) {
      throw new ApiException('VALIDATION_FAILED', { fields: { node_ids: 'unknown topic' } });
    }
    void now;

    // Up to 4 rounds: sample extra ids, drop what does not qualify, top up until enough.
    for (let round = 0; round < 4 && chosen.size < want; round++) {
      const missing = want - chosen.size;
      const perNode = Math.max(5, Math.ceil((missing * 3) / nodeIds.length));
      const sampled = (await Promise.all(nodeIds.map((n) => this.pools.sample(n, perNode)))).flat();
      const ids = [...new Set(sampled)].filter(
        (id) => id !== 0n && !chosen.has(id) && !excluded.has(String(id)),
      );
      if (ids.length === 0) break;
      for (const q of shuffle(await this.fetch(ids, select, difficulty))) {
        if (accept(q) && chosen.size < want) chosen.set(q.id, q);
      }
    }
    return [...chosen.values()];
  }

  private fetch<S extends Prisma.questionsSelect>(
    ids: bigint[],
    select: S,
    difficulty: { lte: number } | { gte: number } | undefined,
  ) {
    return this.prisma.questions.findMany({
      where: { id: { in: ids }, status: 'published', ...(difficulty ? { difficulty } : {}) },
      select,
    }) as unknown as Promise<
      {
        id: bigint;
        body: string;
        options: Prisma.JsonValue;
        correct_option: string;
        is_premium: boolean;
        primary_node_id: number;
      }[]
    >;
  }

  // ------------------------------------------------------------------ quick answer

  /** FR-PRAC-02: check one answer now. Only the first answer per question counts. */
  async answer(user: Pick<users, 'id'>, attemptId: bigint, questionId: string, option: string) {
    const meta = await this.attempts.loadMeta(attemptId, user.id);
    if (!meta) throw new ApiException('NOT_FOUND');
    if (meta.kind !== 'quick_practice') {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { attempt: 'not a quick practice session' },
      });
    }
    if (meta.status !== 'in_progress') throw new ApiException('ATTEMPT_CLOSED');

    const rawKey = await this.redis.client.get(practiceKeyKey(attemptId));
    const key = rawKey ? (JSON.parse(rawKey) as Record<string, string>) : null;
    const correctOption = key?.[questionId];
    if (!correctOption) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { question_id: 'not in this session' },
      });
    }

    const now = new Date();
    const first = (await this.redis.client.hsetnx(answersKey(attemptId), questionId, option)) === 1;
    if (first) {
      const subscribed = await this.entitlement.hasAnySubscription(user.id, now);
      if (!subscribed) {
        try {
          await this.assertQuota(user.id, now, 0);
        } catch (err) {
          await this.redis.client.hdel(answersKey(attemptId), questionId); // not counted
          throw err;
        }
        await this.countQuota(user.id, now, 1);
      }
      await this.redis.client.expire(answersKey(attemptId), ATTEMPT_TTL_SEC);
      await this.redis.client.xadd(
        STATS_STREAM,
        'MAXLEN',
        '~',
        1_000_000,
        '*',
        'type',
        'answer',
        'user_id',
        String(user.id),
        'question_id',
        questionId,
        'correct',
        option === correctOption ? '1' : '0',
        'at',
        String(now.getTime()),
      );
    }

    const q = await this.prisma.questions.findUnique({
      where: { id: BigInt(questionId) },
      select: { explanation: true },
    });

    if (first && (await this.redis.client.hlen(answersKey(attemptId))) >= meta.total) {
      await this.finish(user.id, attemptId, meta, key as Record<string, string>);
    }
    return {
      is_correct: option === correctOption,
      correct_option: correctOption,
      explanation: q?.explanation ?? null,
    };
  }

  /** All questions answered: write the result row so history and the result screen work. */
  private async finish(
    userId: bigint,
    attemptId: bigint,
    meta: AttemptMeta,
    key: Record<string, string>,
  ): Promise<void> {
    const answers = await this.redis.client.hgetall(answersKey(attemptId));
    let correct = 0;
    for (const [qid, right] of Object.entries(key)) if (answers[qid] === right) correct++;
    const total = Object.keys(key).length;
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE attempts SET status = 'scored', answers = ${JSON.stringify(answers)},
        submitted_at = ${now}, time_taken_sec = ${Math.round((now.getTime() - meta.started_ms) / 1000)},
        correct_count = ${correct}, wrong_count = ${total - correct}, skipped_count = 0,
        score = ${correct}
      WHERE id = ${attemptId} AND user_id = ${userId} AND started_at = ${new Date(meta.started_ms)}`;
    await this.redis.client.hset(metaKey(attemptId), 'status', 'submitted');
  }

  // ------------------------------------------------------------------ FR-PRAC-06 daily limit

  /** Throws 402 when a free user has used today's practice questions. */
  private async assertQuota(userId: bigint, now: Date, extra: number): Promise<void> {
    const limit = await this.settings.number('free_practice_per_day', 50);
    const used = Number(await this.redis.client.get(quotaKey(userId, dhakaDayOf(now)))) || 0;
    if (used + extra >= limit) {
      throw new ApiException('QUOTA_EXHAUSTED', {
        resets_at: nextDhakaMidnight(now).toISOString(),
      });
    }
  }

  private async countQuota(userId: bigint, now: Date, n: number): Promise<void> {
    if (n <= 0) return;
    const key = quotaKey(userId, dhakaDayOf(now));
    await this.redis.client
      .multi()
      .incrby(key, n)
      .expire(key, 2 * 86_400)
      .exec();
  }
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
