import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaperService } from './paper.service';

const TICK_MS = 30_000;
const PAPER_LEAD_MS = 30 * 60_000;
const LOCK_KEY = 'sched:exam-jobs';

/**
 * Scheduler loop. A Redis lock makes a second scheduler instance a harmless no-op for that tick.
 * Later phases add auto-submit and merit publish here.
 */
@Injectable()
export class ExamJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamJobsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly papers: PaperService,
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
    try {
      await this.buildDuePapers(now);
    } catch (err) {
      this.logger.error(`exam jobs failed: ${(err as Error).message}`);
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
}
