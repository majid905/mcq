import { Injectable } from '@nestjs/common';
import type { exams } from '@prisma/client';
import { dhakaMonthStart } from '../common/dhaka-time';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

export type LockedReason = 'premium_required' | 'quota_exhausted';

export interface AccessDecision {
  locked: LockedReason | null;
  /** When a quota lock lifts (first instant of next Dhaka month). */
  resetsAt?: Date;
}

interface CachedSub {
  category_ids: number[] | null;
  ends_at: string;
}

const SUB_TTL_SEC = 300;
export const subCacheKey = (userId: bigint | string) => `user:${userId}:sub`;

/**
 * FR-EXAM-03. Premium exams need an active subscription (or trial). Free live exams are open to
 * everyone, but users without a subscription get `free_live_exams_per_month` of them.
 * Billing (Phase 4) writes `subscriptions` and deletes the `user:{id}:sub` cache key.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  private async activeSubs(userId: bigint, now: Date): Promise<CachedSub[]> {
    const key = subCacheKey(userId);
    let subs: CachedSub[];
    const cached = await this.redis.client.get(key);
    if (cached) {
      subs = JSON.parse(cached) as CachedSub[];
    } else {
      const rows = await this.prisma.subscriptions.findMany({
        where: { user_id: userId, starts_at: { lte: now }, ends_at: { gt: now } },
        select: { category_ids: true, ends_at: true },
      });
      subs = rows.map((r) => ({
        category_ids: Array.isArray(r.category_ids) ? r.category_ids.map(Number) : null,
        ends_at: r.ends_at.toISOString(),
      }));
      await this.redis.client.set(key, JSON.stringify(subs), 'EX', SUB_TTL_SEC);
    }
    return subs.filter((s) => new Date(s.ends_at) > now);
  }

  /** Any active subscription at all (used for the free daily practice limit). */
  async hasAnySubscription(userId: bigint, now = new Date()): Promise<boolean> {
    return (await this.activeSubs(userId, now)).length > 0;
  }

  async hasSubscription(userId: bigint, categoryId: number, now = new Date()): Promise<boolean> {
    return (await this.activeSubs(userId, now)).some(
      (s) => s.category_ids === null || s.category_ids.includes(categoryId),
    );
  }

  /** Whether `userId` may begin a new ranked attempt on `exam`. */
  async decide(
    userId: bigint,
    exam: Pick<exams, 'category_id' | 'is_premium' | 'type'>,
    now = new Date(),
  ): Promise<AccessDecision> {
    if (await this.hasSubscription(userId, exam.category_id, now)) return { locked: null };
    if (exam.is_premium) return { locked: 'premium_required' };
    if (exam.type !== 'live') return { locked: null };

    const limit = await this.settings.number('free_live_exams_per_month', 4);
    const monthStart = dhakaMonthStart(now);
    const used = await this.prisma.attempts.count({
      where: { user_id: userId, kind: 'live', started_at: { gte: monthStart } },
    });
    if (used < limit) return { locked: null };
    return { locked: 'quota_exhausted', resetsAt: dhakaMonthStart(now, 1) };
  }
}
