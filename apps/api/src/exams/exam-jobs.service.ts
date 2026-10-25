import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ATTEMPT_GRACE_SEC } from '../attempts/attempt-state';
import { AttemptsService } from '../attempts/attempts.service';
import { MeritService } from '../attempts/merit.service';
import { missingPartitions, reorganizeSql } from '../attempts/partitions';
import { NotificationService } from '../notifications/notification.service';
import { examReminder, meritPublished } from '../notifications/templates';
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
    @Optional() private readonly notifications?: NotificationService,
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
      ['reminders', () => this.sendReminders(now)],
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
      await this.notifyMerit(exam.id);
    }
    return published;
  }

  /**
   * FR-EXAM-02: push to everyone who set a reminder, 15 and 1 minute before the start. Progress is
   * kept in Redis (a cursor per exam and slot), so a crash or a slow tick never sends twice.
   */
  async sendReminders(now: Date): Promise<number> {
    if (!this.notifications) return 0;
    const exams = await this.prisma.exams.findMany({
      where: {
        status: { in: ['scheduled', 'running'] },
        start_at: { gt: now, lte: new Date(now.getTime() + 16 * 60_000) },
      },
      select: { id: true, title_bn: true, title_en: true, start_at: true },
    });
    let sent = 0;
    for (const exam of exams) {
      const leftMs = (exam.start_at?.getTime() ?? 0) - now.getTime();
      for (const slot of [15, 1]) {
        if (leftMs > slot * 60_000) continue; // not due yet
        if (slot === 15 && leftMs < 5 * 60_000) continue; // too late to still say "15 minutes"
        const done = `remind:${exam.id}:${slot}:done`;
        const cursorKey = `remind:${exam.id}:${slot}:cursor`;
        if (await this.redis.client.exists(done)) continue;
        const minutes = Math.max(1, Math.round(leftMs / 60_000));
        let after = BigInt((await this.redis.client.get(cursorKey)) ?? 0);
        for (;;) {
          const rows = await this.prisma.exam_reminders.findMany({
            where: { exam_id: exam.id, user_id: { gt: after } },
            orderBy: { user_id: 'asc' },
            take: 500,
            select: { user_id: true },
          });
          if (rows.length === 0) break;
          sent += await this.notifications.notifyMany(
            rows.map((r) => r.user_id),
            examReminder(exam, slot === 15 ? minutes : 1),
          );
          after = rows[rows.length - 1]?.user_id ?? after;
          await this.redis.client.set(cursorKey, String(after), 'EX', 3600);
        }
        await this.redis.client.set(done, '1', 'EX', 86_400);
      }
    }
    if (sent > 0) this.logger.log(`exam reminders sent: ${sent}`);
    return sent;
  }

  /** FR-NOTI-01: tell every participant the final merit list is out. Never blocks the publish. */
  private async notifyMerit(examId: bigint): Promise<void> {
    if (!this.notifications) return;
    const key = `merit:notified:${examId}`;
    if ((await this.redis.client.set(key, '1', 'EX', 7 * 86_400, 'NX')) !== 'OK') return;
    try {
      const exam = await this.prisma.exams.findUniqueOrThrow({
        where: { id: examId },
        select: { id: true, title_bn: true, title_en: true },
      });
      const rows = await this.prisma.attempts.findMany({
        where: { exam_id: examId, kind: 'live', status: 'scored' },
        select: { user_id: true },
      });
      await this.notifications.notifyMany(
        rows.map((r) => r.user_id),
        meritPublished(exam),
      );
    } catch (err) {
      await this.redis.client.del(key);
      this.logger.error(`merit notifications failed exam=${examId}: ${(err as Error).message}`);
    }
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
