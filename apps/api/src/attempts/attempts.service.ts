import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { attempts, exams, users } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { EntitlementService } from '../exams/entitlement.service';
import { effectiveStatus } from '../exams/exam-card';
import { PaperService, type PaperDto } from '../exams/paper.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  ATTEMPT_GRACE_SEC,
  ATTEMPT_TTL_SEC,
  START_CUTOFF_SEC,
  SUBMIT_STREAM,
  answersKey,
  computeEndsAt,
  extraKey,
  metaFromHash,
  metaKey,
  metaToHash,
  startLockKey,
  submitFlagKey,
  type AttemptMeta,
} from './attempt-state';
import type { AnswerSyncDto } from './attempts.schemas';

export interface AttemptStartDto {
  attempt_id: string;
  kind: AttemptMeta['kind'];
  server_time: string;
  started_at: string;
  ends_at: string;
  paper_url: string | null;
  paper: PaperDto | null;
  shuffle_seed: number | null;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  saved_answers: Record<string, string>;
}

const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class AttemptsService {
  /** exam id -> known question ids, so a sync never reads the whole answer key from Redis. */
  private readonly questionIds = new Map<string, { ids: Set<string>; exp: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly papers: PaperService,
    private readonly entitlement: EntitlementService,
    private readonly limits: RateLimitService,
  ) {}

  // ------------------------------------------------------------------ start

  /** FR-EXAM-04, 05, 09, 11. Starts a new attempt or resumes the one in progress. */
  async start(
    user: Pick<users, 'id' | 'district_id'>,
    exam: exams,
    mode: 'ranked' | 'practice',
    platform: string | undefined,
  ): Promise<AttemptStartDto> {
    const now = new Date();
    const kind = this.kindFor(exam, mode, now);

    const lock = await this.acquireLock(exam.id, user.id);
    try {
      const existing = await this.prisma.attempts.findFirst({
        where: { exam_id: exam.id, user_id: user.id, kind },
        orderBy: { started_at: 'desc' },
      });
      if (existing) {
        const resumed = await this.tryResume(existing, exam, now);
        if (resumed) return resumed;
        if (kind === 'live') throw new ApiException('ALREADY_ATTEMPTED');
      }

      await this.assertAccess(user.id, exam, kind, now);

      const shuffles = exam.shuffle_questions || exam.shuffle_options;
      const seed = shuffles ? randomInt(1, 2 ** 32) : null;
      const row = await this.prisma.attempts.create({
        data: {
          user_id: user.id,
          exam_id: exam.id,
          kind,
          started_at: now,
          total_questions: exam.question_count,
          shuffle_seed: seed,
          district_id: user.district_id,
          client_platform:
            platform === 'android' || platform === 'ios' || platform === 'web' ? platform : null,
        },
      });
      const endsAt = computeEndsAt(now, exam.duration_sec, kind, exam.end_at);
      const meta: AttemptMeta = {
        user_id: String(user.id),
        exam_id: String(exam.id),
        kind,
        started_ms: now.getTime(),
        ends_ms: endsAt.getTime(),
        status: 'in_progress',
        total: exam.question_count,
        district_id: user.district_id === null ? null : String(user.district_id),
      };
      await this.redis.client
        .multi()
        .hset(metaKey(row.id), metaToHash(meta))
        .expire(metaKey(row.id), ATTEMPT_TTL_SEC)
        .exec();
      if (kind === 'live') await this.redis.client.incr(`exam:${exam.id}:participants`);
      return this.startDto(row, exam, endsAt, {});
    } finally {
      await this.releaseLock(exam.id, user.id, lock);
    }
  }

  private kindFor(exam: exams, mode: 'ranked' | 'practice', now: Date): AttemptMeta['kind'] {
    if (exam.type !== 'live') return exam.type;
    const status = effectiveStatus(exam, now);
    if (status === 'upcoming' || status === 'open_soon') throw new ApiException('EXAM_NOT_STARTED');
    const finished = status === 'finished' || status === 'merit_published';
    if (mode === 'practice') {
      if (!finished) {
        throw new ApiException('VALIDATION_FAILED', {
          fields: { mode: 'practice is only available after the exam has ended' },
        });
      }
      return 'live_practice';
    }
    const cutoff = exam.end_at ? exam.end_at.getTime() - START_CUTOFF_SEC * 1000 : Infinity;
    if (finished || now.getTime() > cutoff) throw new ApiException('ATTEMPT_CLOSED');
    return 'live';
  }

  /** Returns the saved attempt when it is still open; null when it is finished (or timed out). */
  private async tryResume(row: attempts, exam: exams, now: Date): Promise<AttemptStartDto | null> {
    if (row.status !== 'in_progress') return null;
    const meta = await this.loadMeta(row.id, row.user_id);
    if (!meta || meta.status === 'submitted') return null;
    if (now.getTime() > meta.ends_ms + ATTEMPT_GRACE_SEC * 1000) return null;
    const saved = await this.savedAnswers(row);
    return this.startDto(row, exam, new Date(meta.ends_ms), saved);
  }

  private async assertAccess(userId: bigint, exam: exams, kind: AttemptMeta['kind'], now: Date) {
    const d = await this.entitlement.decide(userId, exam, now);
    if (d.locked === 'premium_required') {
      const pkgs = await this.prisma.packages.findMany({
        where: { is_active: true },
        select: { id: true },
        orderBy: { sort_order: 'asc' },
        take: 10,
      });
      throw new ApiException('PREMIUM_REQUIRED', { package_ids: pkgs.map((p) => String(p.id)) });
    }
    // Practice after the exam is not metered by the monthly live quota.
    if (d.locked === 'quota_exhausted' && kind === 'live') {
      throw new ApiException('QUOTA_EXHAUSTED', { resets_at: d.resetsAt?.toISOString() });
    }
  }

  private async startDto(
    row: attempts,
    exam: exams,
    endsAt: Date,
    saved: Record<string, string>,
  ): Promise<AttemptStartDto> {
    // Without a CDN copy the paper is inlined so the client needs no second request.
    const paper = exam.paper_url ? null : await this.papers.getPaper(exam.id);
    return {
      attempt_id: String(row.id),
      kind: row.kind,
      server_time: new Date().toISOString(),
      started_at: row.started_at.toISOString(),
      ends_at: endsAt.toISOString(),
      paper_url: exam.paper_url,
      paper,
      shuffle_seed: row.shuffle_seed,
      shuffle_questions: exam.shuffle_questions,
      shuffle_options: exam.shuffle_options,
      saved_answers: saved,
    };
  }

  private async savedAnswers(row: attempts): Promise<Record<string, string>> {
    const cached = await this.redis.client.hgetall(answersKey(row.id));
    if (Object.keys(cached).length > 0) return cached;
    const a = row.answers;
    return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, string>) : {};
  }

  // ------------------------------------------------------------------ sync + submit

  /** FR-EXAM-07: periodic full answer map. Redis only, never MySQL. */
  async sync(userId: bigint, attemptId: bigint, body: AnswerSyncDto) {
    await this.limits.assert(`att:${attemptId}:sync`, 6, 60);
    const meta = await this.openMeta(userId, attemptId);
    const answers = await this.filter(meta, body.answers);
    await this.writeAnswers(attemptId, answers, body).exec();
    return { saved_count: Object.keys(answers).length, server_time: new Date().toISOString() };
  }

  /**
   * FR-EXAM-08: validate, queue on the `q:submit` stream and answer 202. Calling it again is a
   * no-op, so a retry after a lost response is safe.
   */
  async submit(userId: bigint, attemptId: bigint, body: AnswerSyncDto) {
    const meta = await this.loadMeta(attemptId, userId);
    if (!meta) throw new ApiException('NOT_FOUND');
    const received = { status: 'received' as const, result_eta_sec: 10 };
    if (meta.status === 'submitted') return received;
    const now = Date.now();
    if (now > meta.ends_ms + ATTEMPT_GRACE_SEC * 1000) throw new ApiException('ATTEMPT_CLOSED');

    const first = await this.redis.client.set(
      submitFlagKey(attemptId),
      '1',
      'EX',
      ATTEMPT_TTL_SEC,
      'NX',
    );
    if (first !== 'OK') return received;

    const answers = await this.filter(meta, body.answers);
    await this.writeAnswers(attemptId, answers, body)
      .hset(metaKey(attemptId), 'status', 'submitted')
      .xadd(
        SUBMIT_STREAM,
        'MAXLEN',
        '~',
        1_000_000,
        '*',
        'attempt_id',
        String(attemptId),
        'user_id',
        String(userId),
        'exam_id',
        meta.exam_id ?? '',
        'kind',
        meta.kind,
        'district_id',
        meta.district_id ?? '',
        'started_ms',
        String(meta.started_ms),
        'submitted_ms',
        String(Math.min(now, meta.ends_ms)),
      )
      .exec();
    return received;
  }

  /**
   * Scheduler auto-submit (FR-EXAM-08): queue an attempt whose owner never pressed submit, using
   * the last synced answers. Returns false when it was already queued.
   */
  async autoSubmit(
    row: {
      id: bigint;
      user_id: bigint;
      exam_id: bigint | null;
      kind: AttemptMeta['kind'];
      started_at: Date;
      district_id: number | null;
    },
    endsMs: number,
  ): Promise<boolean> {
    const first = await this.redis.client.set(
      submitFlagKey(row.id),
      '1',
      'EX',
      ATTEMPT_TTL_SEC,
      'NX',
    );
    if (first !== 'OK') return false;
    await this.redis.client
      .multi()
      .hset(metaKey(row.id), 'status', 'submitted')
      .xadd(
        SUBMIT_STREAM,
        'MAXLEN',
        '~',
        1_000_000,
        '*',
        'attempt_id',
        String(row.id),
        'user_id',
        String(row.user_id),
        'exam_id',
        row.exam_id === null ? '' : String(row.exam_id),
        'kind',
        row.kind,
        'district_id',
        row.district_id === null ? '' : String(row.district_id),
        'started_ms',
        String(row.started_at.getTime()),
        'submitted_ms',
        String(endsMs),
      )
      .exec();
    return true;
  }

  private writeAnswers(attemptId: bigint, answers: Record<string, string>, body: AnswerSyncDto) {
    const multi = this.redis.client.multi().del(answersKey(attemptId));
    if (Object.keys(answers).length > 0) multi.hset(answersKey(attemptId), answers);
    multi.expire(answersKey(attemptId), ATTEMPT_TTL_SEC);
    multi.hset(extraKey(attemptId), {
      focus_loss: String(body.focus_loss_count ?? 0),
      marked: JSON.stringify(body.marked_for_review ?? []),
    });
    multi.expire(extraKey(attemptId), ATTEMPT_TTL_SEC);
    return multi;
  }

  /** Attempt meta for a still-open attempt: 404 if not yours, 410 once submitted or past the grace. */
  private async openMeta(userId: bigint, attemptId: bigint): Promise<AttemptMeta> {
    const meta = await this.loadMeta(attemptId, userId);
    if (!meta) throw new ApiException('NOT_FOUND');
    if (meta.status !== 'in_progress') throw new ApiException('ATTEMPT_CLOSED');
    if (Date.now() > meta.ends_ms + ATTEMPT_GRACE_SEC * 1000) {
      throw new ApiException('ATTEMPT_CLOSED');
    }
    return meta;
  }

  /** Redis first; on a miss rebuild from MySQL (query always carries user_id). */
  async loadMeta(attemptId: bigint, userId: bigint): Promise<AttemptMeta | null> {
    const hit = metaFromHash(await this.redis.client.hgetall(metaKey(attemptId)));
    if (hit) return hit.user_id === String(userId) ? hit : null;

    const row = await this.prisma.attempts.findFirst({ where: { id: attemptId, user_id: userId } });
    if (!row) return null;
    const exam = row.exam_id
      ? await this.prisma.exams.findUnique({ where: { id: row.exam_id } })
      : null;
    const duration = exam?.duration_sec ?? 0;
    const meta: AttemptMeta = {
      user_id: String(userId),
      exam_id: row.exam_id === null ? null : String(row.exam_id),
      kind: row.kind,
      started_ms: row.started_at.getTime(),
      ends_ms: computeEndsAt(row.started_at, duration, row.kind, exam?.end_at ?? null).getTime(),
      status: row.status === 'in_progress' ? 'in_progress' : 'submitted',
      total: row.total_questions,
      district_id: row.district_id === null ? null : String(row.district_id),
    };
    await this.redis.client
      .multi()
      .hset(metaKey(attemptId), metaToHash(meta))
      .expire(metaKey(attemptId), ATTEMPT_TTL_SEC)
      .exec();
    return meta;
  }

  /** Drops answers for questions that are not in this exam, so junk never reaches the worker. */
  private async filter(meta: AttemptMeta, answers: Record<string, string>) {
    if (!meta.exam_id) return answers;
    const ids = await this.knownQuestionIds(BigInt(meta.exam_id));
    return Object.fromEntries(Object.entries(answers).filter(([qid]) => ids.has(qid)));
  }

  private async knownQuestionIds(examId: bigint): Promise<Set<string>> {
    const key = String(examId);
    const hit = this.questionIds.get(key);
    if (hit && hit.exp > Date.now()) return hit.ids;
    const ids = new Set(Object.keys((await this.papers.getKey(examId)).correct));
    this.questionIds.set(key, { ids, exp: Date.now() + 60_000 });
    return ids;
  }

  // ------------------------------------------------------------------ start lock

  private async acquireLock(examId: bigint, userId: bigint): Promise<string> {
    const token = randomUUID();
    for (let i = 0; i < 20; i++) {
      const ok = await this.redis.client.set(startLockKey(examId, userId), token, 'PX', 5000, 'NX');
      if (ok === 'OK') return token;
      await sleep(100);
    }
    throw new ApiException('RATE_LIMITED', { retry_after_sec: 1 });
  }

  private async releaseLock(examId: bigint, userId: bigint, token: string): Promise<void> {
    await this.redis.client.eval(RELEASE_LOCK, 1, startLockKey(examId, userId), token);
  }
}
