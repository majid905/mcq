import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ATTEMPT_GRACE_SEC } from '../attempts/attempt-state';
import { AttemptsService } from '../attempts/attempts.service';
import { MeritService } from '../attempts/merit.service';
import { missingPartitions, reorganizeSql } from '../attempts/partitions';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaperService } from './paper.service';

const TICK_MS = 30_000;
const PAPER_LEAD_MS = 30 * 60_000;
const MERIT_DELAY_MS = 5 * 60_000;
const LOCK_KEY = 'sched:exam-jobs';
const AUTOSUBMIT_DONE = (examId: bigint) => `exam:${examId}:autosubmit_done`;

/**
 * Scheduler loop (docs/02 section 4). A Redis lock makes a second scheduler instance a harmless
 * no-op for that tick, and every step is idempotent so a crashed tick is simply repeated.
 */
@Injectable()
export class ExamJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamJobsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly papers: PaperService,
    private readonly attempts: AttemptsService,
    private readonly merit: MeritService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    const got = await this.redis.client.set(LOCK_KEY, '1', 'PX', TICK_MS - 1000, 'NX');
    if (got !== 'OK') return;
    const steps: [string, () => Promise<unknown>][] = [
      ['papers', () => this.buildDuePapers(now)],
      ['status', () => this.flipStatuses(now)],
      ['participants', () => this.flushParticipants()],
      ['autosubmit', () => this.autoSubmitEnded(now)],
      ['merit', () => this.publishMerit(now)],
      ['partitions', () => this.ensurePartitions(now)],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (err) {
        this.logger.error(`exam job "${name}" failed: ${(err as Error).message}`);
      }
    }
  }

  /** T-30 min: build paper + answer key for scheduled/running exams that have none yet. */
  async buildDuePapers(now: Date): Promise<number> {
    const due = await this.prisma.exams.findMany({
      where: {
        status: { in: ['scheduled', 'running'] },
        start_at: { lte: new Date(now.getTime() + PAPER_LEAD_MS) },
        OR: [{ end_at: null }, { end_at: { gt: now } }],
      },
      select: { id: true },
    });
    let built = 0;
    for (const { id } of due) {
      if (await this.papers.isBuilt(id)) continue;
      try {
        await this.papers.build(id);
        built++;
      } catch (err) {
        this.logger.error(`paper build failed exam=${id}: ${(err as Error).message}`);
      }
    }
    return built;
  }

  /** scheduled -> running at start_at, -> ended at end_at. The API already shows the clock status. */
  async flipStatuses(now: Date): Promise<void> {
    await this.prisma.exams.updateMany({
      where: { status: 'scheduled', start_at: { lte: now }, end_at: { gt: now } },
      data: { status: 'running' },
    });
    await this.prisma.exams.updateMany({
      where: { status: { in: ['scheduled', 'running'] }, type: 'live', end_at: { lte: now } },
      data: { status: 'ended' },
    });
  }

  /** `exam:{id}:participants` counts starts in Redis; fold it into MySQL without losing increments. */
  async flushParticipants(): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.client.scan(
        cursor,
        'MATCH',
        'exam:*:participants',
        'COUNT',
        200,
      );
      cursor = next;
      for (const key of keys) {
        const n = Number(await this.redis.client.get(key));
        const id = /^exam:(\d+):participants$/.exec(key)?.[1];
        if (!id || !Number.isInteger(n) || n <= 0) continue;
        await this.prisma.exams.update({
          where: { id: BigInt(id) },
          data: { participant_count: { increment: n } },
        });
        await this.redis.client.decrby(key, n);
      }
    } while (cursor !== '0');
  }

  /**
   * At end_at + grace every attempt that is still open is queued with its last synced answers.
   * One pass is enough: nobody can start after end_at - 1 min, and every deadline is <= end_at.
   */
  async autoSubmitEnded(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - ATTEMPT_GRACE_SEC * 1000);
    const exams = await this.prisma.exams.findMany({
      where: {
        type: 'live',
        status: { in: ['scheduled', 'running', 'ended'] },
        end_at: { lte: cutoff, gt: new Date(now.getTime() - 2 * 86_400_000) },
      },
      select: { id: true, end_at: true },
    });
    let queued = 0;
    for (const exam of exams) {
      if (await this.redis.client.exists(AUTOSUBMIT_DONE(exam.id))) continue;
      let after = 0n;
      for (;;) {
        const rows = await this.prisma.attempts.findMany({
          where: { exam_id: exam.id, kind: 'live', status: 'in_progress', id: { gt: after } },
          orderBy: { id: 'asc' },
          take: 1000,
        });
        if (rows.length === 0) break;
        for (const row of rows) {
          const endsMs = exam.end_at ? exam.end_at.getTime() : row.started_at.getTime();
          if (await this.attempts.autoSubmit(row, Math.min(endsMs, Date.now()))) queued++;
        }
        after = rows[rows.length - 1]?.id ?? after;
      }
      await this.redis.client.set(AUTOSUBMIT_DONE(exam.id), '1', 'EX', 7 * 86_400);
      if (queued > 0) this.logger.log(`auto-submitted ${queued} attempts exam=${exam.id}`);
    }
    return queued;
  }

  /** T+5 min (or `result_publish_at`): once everything is scored, write ranks and flip the status. */
  async publishMerit(now: Date): Promise<number> {
    const exams = await this.prisma.exams.findMany({
      where: {
        type: 'live',
        status: { in: ['scheduled', 'running', 'ended'] },
        end_at: { lte: now },
      },
      select: { id: true, end_at: true, result_publish_at: true },
    });
    let published = 0;
    for (const exam of exams) {
      const at = exam.result_publish_at ?? new Date((exam.end_at?.getTime() ?? 0) + MERIT_DELAY_MS);
      if (now < at) continue;
      if (!(await this.redis.client.exists(AUTOSUBMIT_DONE(exam.id)))) continue;
      const pending = await this.merit.pending(exam.id);
      if (pending > 0) {
        this.logger.warn(`merit waits exam=${exam.id}: ${pending} attempts not scored yet`);
        continue;
      }
      await this.merit.publish(exam.id);
      published++;
    }
    return published;
  }

  /** Daily: keep three future monthly partitions on `attempts` (database/partition-maintenance.sql). */
  async ensurePartitions(now: Date): Promise<void> {
    const ran = await this.redis.client.set('sched:partitions', '1', 'EX', 86_400, 'NX');
    if (ran !== 'OK') return;
    try {
      const rows = await this.prisma.$queryRaw<{ name: string }[]>`
        SELECT PARTITION_NAME AS name FROM information_schema.PARTITIONS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attempts'`;
      const missing = missingPartitions(
        rows.map((r) => r.name),
        now,
      );
      if (missing.length === 0) return;
      await this.prisma.$executeRawUnsafe(reorganizeSql(missing));
      this.logger.log(`added attempts partitions: ${missing.map((m) => m.name).join(', ')}`);
    } catch (err) {
      await this.redis.client.del('sched:partitions');
      throw err;
    }
  }
}
