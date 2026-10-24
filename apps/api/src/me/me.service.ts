import { Injectable } from '@nestjs/common';
import type { users } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

export interface MeDto {
  id: string;
  phone: string;
  name: string;
  avatar_url: string | null;
  district_id: number | null;
  target_node_ids: string[];
  locale: 'bn' | 'en';
  theme: 'system' | 'light' | 'dark';
  onboarding_done: boolean;
  subscription: {
    is_premium: boolean;
    source: 'payment' | 'trial' | 'manual' | null;
    ends_at: string | null;
    category_ids: string[] | null;
    trial_available: boolean;
  };
  quotas: {
    practice_left_today: number | null;
    live_exams_left_month: number | null;
    search_answers_left_today: number | null;
  };
}

/** Asia/Dhaka is UTC+6 all year; daily quotas reset at Dhaka midnight. */
export function dhakaDay(now = new Date()): string {
  return new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
}

const toIdList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map((x) => String(x)) : [];

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  /** Active subscription (latest end date still in the future), if any. */
  activeSubscription(userId: bigint) {
    return this.prisma.subscriptions.findFirst({
      where: { user_id: userId, ends_at: { gt: new Date() } },
      orderBy: { ends_at: 'desc' },
    });
  }

  async toMe(user: users): Promise<MeDto> {
    const sub = await this.activeSubscription(user.id);
    const premium = sub !== null;
    const targets = toIdList(user.target_node_ids);

    let quotas: MeDto['quotas'] = {
      practice_left_today: null,
      live_exams_left_month: null,
      search_answers_left_today: null,
    };
    if (!premium) {
      const day = dhakaDay();
      const month = day.slice(0, 7);
      const [practiceLimit, examLimit, searchLimit] = await Promise.all([
        this.settings.number('free_practice_per_day', 50),
        this.settings.number('free_live_exams_per_month', 4),
        this.settings.number('free_search_answers_per_day', 10),
      ]);
      const used = await this.redis.client.mget(
        `quota:practice:${user.id}:${day}`,
        `quota:live:${user.id}:${month}`,
        `quota:search:${user.id}:${day}`,
      );
      const left = (limit: number, u: string | null) => Math.max(limit - Number(u ?? 0), 0);
      quotas = {
        practice_left_today: left(practiceLimit, used[0] ?? null),
        live_exams_left_month: left(examLimit, used[1] ?? null),
        search_answers_left_today: left(searchLimit, used[2] ?? null),
      };
    }

    return {
      id: String(user.id),
      phone: user.phone,
      name: user.name,
      avatar_url: user.avatar_url,
      district_id: user.district_id,
      target_node_ids: targets,
      locale: user.locale,
      theme: user.theme,
      onboarding_done: user.district_id !== null && targets.length > 0,
      subscription: {
        is_premium: premium,
        source: sub?.source ?? null,
        ends_at: sub?.ends_at.toISOString() ?? null,
        category_ids: sub && Array.isArray(sub.category_ids) ? toIdList(sub.category_ids) : null,
        trial_available: !user.trial_used && !premium,
      },
      quotas,
    };
  }
}
