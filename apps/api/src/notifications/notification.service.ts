import { Inject, Injectable, Logger } from '@nestjs/common';
import type { notifications_type } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { Page } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PUSH_SENDER, type PushMessage, type PushSender } from './push.sender';

export interface NotificationPrefsDto {
  exam_reminder: boolean;
  result: boolean;
  subscription: boolean;
  promotional: boolean;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string | null;
  read: boolean;
  created_at: string;
}

export interface Template {
  type: notifications_type;
  /** Text per language; `{}` placeholders are already filled by the caller. */
  bn: { title: string; body: string };
  en: { title: string; body: string };
  deepLink?: string;
}

/** Which preference switch silences which type. Types without one are always delivered. */
const PREF_OF: Partial<Record<notifications_type, keyof NotificationPrefsDto>> = {
  exam_reminder: 'exam_reminder',
  result: 'result',
  subscription: 'subscription',
  broadcast: 'promotional',
};

const DEFAULT_PREFS: NotificationPrefsDto = {
  exam_reminder: true,
  result: true,
  subscription: true,
  promotional: true,
};

const readSetKey = (userId: bigint) => `noti:read:${userId}`;
const readAllKey = (userId: bigint) => `noti:readall:${userId}`;
const BROADCAST_WINDOW_MS = 30 * 86_400_000;
const PUSH_CONCURRENCY = 20;

/**
 * FR-NOTI-01..03. Personal notifications are rows with `user_id`; broadcasts are rows with a NULL
 * `user_id` that everybody sees. A broadcast has no per-user row, so "read" for it lives in Redis
 * (a set of ids, plus a "read everything before" time).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  // ------------------------------------------------------------------ preferences

  async prefs(userId: bigint): Promise<NotificationPrefsDto> {
    const row = await this.prisma.user_notification_prefs.findUnique({
      where: { user_id: userId },
    });
    return row
      ? {
          exam_reminder: row.exam_reminder,
          result: row.result,
          subscription: row.subscription,
          promotional: row.promotional,
        }
      : { ...DEFAULT_PREFS };
  }

  async setPrefs(
    userId: bigint,
    patch: Partial<NotificationPrefsDto>,
  ): Promise<NotificationPrefsDto> {
    const next = { ...(await this.prefs(userId)), ...patch };
    await this.prisma.user_notification_prefs.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...next },
      update: next,
    });
    return next;
  }

  // ------------------------------------------------------------------ inbox

  async list(userId: bigint, cursor: string | undefined, limit: number) {
    const m = cursor ? /^(\d{1,15})_(\d{1,19})$/.exec(cursor) : null;
    if (cursor && !m) {
      throw new ApiException('VALIDATION_FAILED', { fields: { cursor: 'invalid cursor' } });
    }
    const since = new Date(Date.now() - BROADCAST_WINDOW_MS);
    const mine = { OR: [{ user_id: userId }, { user_id: null, created_at: { gte: since } }] };
    const at = m?.[1] ? new Date(Number(m[1])) : null;
    const rows = await this.prisma.notifications.findMany({
      where: {
        AND: [
          mine,
          ...(at && m?.[2]
            ? [{ OR: [{ created_at: { lt: at } }, { created_at: at, id: { lt: BigInt(m[2]) } }] }]
            : []),
        ],
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const [readSet, readAll] = await Promise.all([
      this.redis.client.smembers(readSetKey(userId)),
      this.redis.client.get(readAllKey(userId)),
    ]);
    const readIds = new Set(readSet);
    const readBefore = Number(readAll) || 0;

    const items: NotificationDto[] = page.map((n) => ({
      id: String(n.id),
      type: n.type,
      title: n.title,
      body: n.body,
      deep_link: n.deep_link,
      read:
        n.user_id === null
          ? readIds.has(String(n.id)) || n.created_at.getTime() <= readBefore
          : n.read_at !== null,
      created_at: n.created_at.toISOString(),
    }));
    const last = page[page.length - 1];
    return new Page(items, {
      next_cursor: hasMore && last ? `${last.created_at.getTime()}_${last.id}` : null,
      has_more: hasMore,
      unread_count: await this.unreadCount(userId, readIds, readBefore, since),
    });
  }

  private async unreadCount(
    userId: bigint,
    readIds: Set<string>,
    readBefore: number,
    since: Date,
  ): Promise<number> {
    const [personal, broadcasts] = await Promise.all([
      this.prisma.notifications.count({ where: { user_id: userId, read_at: null } }),
      this.prisma.notifications.findMany({
        where: { user_id: null, created_at: { gte: since } },
        select: { id: true, created_at: true },
        take: 500,
      }),
    ]);
    const unreadBroadcasts = broadcasts.filter(
      (b) => !readIds.has(String(b.id)) && b.created_at.getTime() > readBefore,
    ).length;
    return personal + unreadBroadcasts;
  }

  /** `all: true` marks everything read; otherwise just `ids` (own rows and broadcasts). */
  async markRead(userId: bigint, ids: string[] | undefined, all: boolean | undefined) {
    const now = new Date();
    if (all) {
      await this.prisma.notifications.updateMany({
        where: { user_id: userId, read_at: null },
        data: { read_at: now },
      });
      await this.redis.client.set(readAllKey(userId), String(now.getTime()), 'EX', 90 * 86_400);
      return;
    }
    const wanted = (ids ?? []).filter((i) => /^\d{1,19}$/.test(i)).map((i) => BigInt(i));
    if (wanted.length === 0) return;
    await this.prisma.notifications.updateMany({
      where: { id: { in: wanted }, user_id: userId, read_at: null },
      data: { read_at: now },
    });
    const broadcasts = await this.prisma.notifications.findMany({
      where: { id: { in: wanted }, user_id: null },
      select: { id: true },
    });
    if (broadcasts.length > 0) {
      await this.redis.client.sadd(readSetKey(userId), ...broadcasts.map((b) => String(b.id)));
      await this.redis.client.expire(readSetKey(userId), 90 * 86_400);
    }
  }

  // ------------------------------------------------------------------ sending

  /** Inbox row plus a push to the user's devices, unless the user switched this type off. */
  async notify(userId: bigint, tpl: Template): Promise<void> {
    await this.notifyMany([userId], tpl);
  }

  /**
   * One template to many users, in batches (merit published goes to every participant). The text
   * follows each user's language.
   */
  async notifyMany(userIds: bigint[], tpl: Template): Promise<number> {
    let delivered = 0;
    for (let i = 0; i < userIds.length; i += 500) {
      const chunk = userIds.slice(i, i + 500);
      const [users, prefRows, devices] = await Promise.all([
        this.prisma.users.findMany({
          where: { id: { in: chunk }, status: 'active' },
          select: { id: true, locale: true },
        }),
        this.prisma.user_notification_prefs.findMany({ where: { user_id: { in: chunk } } }),
        this.prisma.user_devices.findMany({
          where: { user_id: { in: chunk }, is_active: true, push_token: { not: null } },
          select: { id: true, user_id: true, push_token: true },
        }),
      ]);
      const prefBy = new Map(prefRows.map((p) => [p.user_id, p]));
      const switchName = PREF_OF[tpl.type];
      const targets = users.filter((u) => {
        const p = prefBy.get(u.id);
        return !switchName || !p || p[switchName];
      });
      if (targets.length === 0) continue;

      await this.prisma.notifications.createMany({
        data: targets.map((u) => ({
          user_id: u.id,
          type: tpl.type,
          title: tpl[u.locale].title,
          body: tpl[u.locale].body,
          deep_link: tpl.deepLink ?? null,
        })),
      });
      delivered += targets.length;

      const localeOf = new Map(targets.map((u) => [u.id, u.locale]));
      const jobs = devices
        .filter((d) => localeOf.has(d.user_id) && d.push_token)
        .map((d) => ({
          id: d.id,
          token: d.push_token as string,
          locale: localeOf.get(d.user_id) ?? 'bn',
        }));
      await this.pushAll(jobs, tpl);
    }
    return delivered;
  }

  private async pushAll(
    jobs: { id: bigint; token: string; locale: 'bn' | 'en' }[],
    tpl: Template,
  ): Promise<void> {
    const dead: bigint[] = [];
    for (let i = 0; i < jobs.length; i += PUSH_CONCURRENCY) {
      await Promise.all(
        jobs.slice(i, i + PUSH_CONCURRENCY).map(async (j) => {
          const msg: PushMessage = { ...tpl[j.locale], deepLink: tpl.deepLink ?? null };
          if ((await this.push.sendToToken(j.token, msg)) === 'invalid_token') dead.push(j.id);
        }),
      );
    }
    if (dead.length > 0) {
      await this.prisma.user_devices.updateMany({
        where: { id: { in: dead } },
        data: { push_token: null },
      });
      this.logger.log(`dropped ${dead.length} dead push tokens`);
    }
  }

  /** Push to one more topic without another inbox row (a broadcast aimed at several categories). */
  async pushTopic(topic: string, tpl: Template): Promise<void> {
    await this.push.sendToTopic(topic, { ...tpl.bn, deepLink: tpl.deepLink ?? null });
  }

  /** Category broadcast: one inbox row for everyone, one push to a topic (admin composer, Phase 4). */
  async broadcast(tpl: Template, topic: string): Promise<void> {
    await this.prisma.notifications.create({
      data: {
        user_id: null,
        type: tpl.type,
        title: tpl.bn.title,
        body: tpl.bn.body,
        deep_link: tpl.deepLink ?? null,
      },
    });
    await this.push.sendToTopic(topic, { ...tpl.bn, deepLink: tpl.deepLink ?? null });
  }
}
