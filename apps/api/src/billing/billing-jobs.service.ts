import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { subscriptionExpiring } from './templates';

const TICK_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const LOCK_KEY = 'sched:billing-jobs';

/** FR-PAY-05: push 3 days and 1 day before a user's last subscription ends. */
@Injectable()
export class BillingJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingJobsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
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
      await this.sendExpiryReminders(now);
    } catch (err) {
      this.logger.error(`expiry reminders failed: ${(err as Error).message}`);
    }
  }

  /**
   * Tier 1 = ends within a day, tier 3 = ends in 1..3 days. A subscription gets each tier once
   * (Redis NX marker) and only counts if it is the user's last one (no renewal queued behind it).
   */
  async sendExpiryReminders(now: Date): Promise<number> {
    let sent = 0;
    const tiers: [number, Date, Date][] = [
      [3, new Date(now.getTime() + DAY_MS), new Date(now.getTime() + 3 * DAY_MS)],
      [1, now, new Date(now.getTime() + DAY_MS)],
    ];
    for (const [days, from, to] of tiers) {
      const subs = await this.prisma.subscriptions.findMany({
        where: { ends_at: { gt: from, lte: to }, starts_at: { lte: now } },
        select: { id: true, user_id: true, ends_at: true },
        take: 5000,
      });
      for (const s of subs) {
        const marker = await this.redis.client.set(
          `subremind:${s.id}:${days}`,
          '1',
          'EX',
          5 * 86_400,
          'NX',
        );
        if (marker !== 'OK') continue;
        const later = await this.prisma.subscriptions.count({
          where: { user_id: s.user_id, ends_at: { gt: s.ends_at } },
        });
        if (later > 0) continue;
        await this.notifications.notify(s.user_id, subscriptionExpiring(days));
        sent++;
      }
    }
    return sent;
  }
}
