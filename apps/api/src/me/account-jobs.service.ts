import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const TICK_MS = 60 * 60_000;
const LOCK_KEY = 'sched:account-jobs';
const RETENTION_MS = 30 * 86_400_000;
const BATCH = 200;
/** Marker prefix of an anonymised phone; also what keeps the job idempotent. */
export const ANON_PHONE_PREFIX = 'del-';

/**
 * FR-AUTH-10 / docs/08 section 2: 30 days after an account was closed, its personal data is removed.
 * Learning statistics, attempts and payments stay (they no longer point at a person); the phone number
 * is freed so the owner can register again.
 */
@Injectable()
export class AccountJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountJobsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    const got = await this.redis.client.set(LOCK_KEY, '1', 'PX', TICK_MS - 5000, 'NX');
    if (got !== 'OK') return;
    try {
      const n = await this.anonymizeDue(now);
      if (n > 0) this.logger.log(`anonymised ${n} closed accounts`);
    } catch (err) {
      this.logger.error(`anonymisation failed: ${(err as Error).message}`);
    }
  }

  async anonymizeDue(now: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const due = await this.prisma.users.findMany({
        where: {
          status: 'deleted',
          deleted_at: { lte: new Date(now.getTime() - RETENTION_MS) },
          NOT: { phone: { startsWith: ANON_PHONE_PREFIX } },
        },
        select: { id: true },
        take: BATCH,
      });
      if (due.length === 0) return total;
      for (const { id } of due) await this.anonymize(id);
      total += due.length;
    }
  }

  private async anonymize(id: bigint): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refresh_tokens.deleteMany({ where: { user_id: id } }),
      this.prisma.user_devices.deleteMany({ where: { user_id: id } }),
      this.prisma.notifications.deleteMany({ where: { user_id: id } }),
      this.prisma.bookmarks.deleteMany({ where: { user_id: id } }),
      this.prisma.exam_reminders.deleteMany({ where: { user_id: id } }),
      this.prisma.user_notification_prefs.deleteMany({ where: { user_id: id } }),
      this.prisma.user_wrong_questions.deleteMany({ where: { user_id: id } }),
      this.prisma.users.update({
        where: { id },
        data: {
          // "del-" + id fits VARCHAR(14) for any id up to 10 digits and stays unique.
          phone: `${ANON_PHONE_PREFIX}${id}`,
          name: 'Deleted user',
          password_hash: null,
          google_sub: null,
          avatar_url: null,
          district_id: null,
          target_node_ids: Prisma.DbNull,
          phone_verified_at: null,
        },
      }),
    ]);
  }
}
