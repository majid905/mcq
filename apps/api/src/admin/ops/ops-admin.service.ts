import { Injectable } from '@nestjs/common';
import type { Prisma, users } from '@prisma/client';
import { DevicesService } from '../../auth/devices.service';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { num } from '../../billing/billing.service';
import { subCacheKey } from '../../exams/entitlement.service';
import { ExamCardsService } from '../../exams/exam-cards.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../../settings/settings.service';
import { SUBMIT_STREAM } from '../../attempts/attempt-state';
import { assertPermission } from '../admin-auth.guard';
import { AuditService, type Actor } from '../audit.service';

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;

/** First instant (UTC) of the Dhaka calendar day containing `now`. */
const dhakaDayStart = (now: Date): Date =>
  new Date(Math.floor((now.getTime() + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS);

export type UserAction = 'reset_device' | 'ban' | 'unban' | 'grant_subscription';

export interface UserActionInput {
  action: UserAction;
  reason: string;
  package_id?: string | undefined;
  days?: number | undefined;
}

const ACTION_PERMISSION: Record<UserAction, string> = {
  reset_device: 'users.reset_device',
  ban: 'users.ban',
  unban: 'users.ban',
  grant_subscription: 'users.grant',
};

/** Users, payments, dashboard and settings screens of the admin panel (L2, L3, L11, L13). */
@Injectable()
export class OpsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly devices: DevicesService,
    private readonly settings: SettingsService,
    private readonly cards: ExamCardsService,
  ) {}

  // ------------------------------------------------------------------ dashboard

  async dashboard() {
    const now = new Date();
    const today = dhakaDayStart(now);
    const monthStart = new Date(
      Date.UTC(
        new Date(now.getTime() + DHAKA_OFFSET_MS).getUTCFullYear(),
        new Date(now.getTime() + DHAKA_OFFSET_MS).getUTCMonth(),
        1,
      ) - DHAKA_OFFSET_MS,
    );
    const thirtyDaysAgo = new Date(today.getTime() - 29 * DAY_MS);

    const [
      signups,
      dau,
      mau,
      revToday,
      revMonth,
      activeSubs,
      published,
      openReports,
      upcoming,
      submitLen,
      statsLen,
    ] = await Promise.all([
      this.prisma.users.count({ where: { created_at: { gte: today } } }),
      this.prisma.user_daily_stats.count({ where: { day: today } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT user_id) AS n FROM user_daily_stats WHERE day >= ${thirtyDaysAgo}`,
      this.prisma.payments.aggregate({
        _sum: { amount_bdt: true },
        where: { status: 'paid', paid_at: { gte: today } },
      }),
      this.prisma.payments.aggregate({
        _sum: { amount_bdt: true },
        where: { status: 'paid', paid_at: { gte: monthStart } },
      }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT user_id) AS n FROM subscriptions WHERE starts_at <= ${now} AND ends_at > ${now}`,
      this.prisma.questions.count({ where: { status: 'published' } }),
      this.prisma.question_reports.count({ where: { status: 'open' } }),
      this.prisma.exams.findMany({
        where: { status: { in: ['scheduled', 'running'] }, start_at: { gte: now } },
        orderBy: { start_at: 'asc' },
        take: 5,
      }),
      this.redis.client.xlen(SUBMIT_STREAM).catch(() => 0),
      this.redis.client.xlen('q:stats').catch(() => 0),
    ]);
    const cards = await this.cards.build({ id: 0n, locale: 'bn' }, upcoming, now);
    return {
      signups_today: signups,
      dau,
      mau: Number(mau[0]?.n ?? 0),
      revenue_today_bdt: num(revToday._sum.amount_bdt ?? 0),
      revenue_month_bdt: num(revMonth._sum.amount_bdt ?? 0),
      active_subscriptions: Number(activeSubs[0]?.n ?? 0),
      questions_published: published,
      open_reports: openReports,
      upcoming_exams: upcoming.flatMap((e) => {
        const c = cards.get(e.id);
        return c ? [c] : [];
      }),
      queues: { submit: submitLen, stats: statsLen },
    };
  }

  // ------------------------------------------------------------------ users

  private async userDto(u: users) {
    const now = new Date();
    const [district, devices, sub, attempts, trialUsedBefore] = await Promise.all([
      u.district_id === null
        ? null
        : this.prisma.districts.findUnique({ where: { id: u.district_id } }),
      this.prisma.user_devices.findMany({
        where: { user_id: u.id },
        orderBy: { id: 'desc' },
        take: 10,
      }),
      this.prisma.subscriptions.findFirst({
        where: { user_id: u.id, starts_at: { lte: now }, ends_at: { gt: now } },
        orderBy: { ends_at: 'desc' },
      }),
      this.prisma.attempts.count({ where: { user_id: u.id } }),
      Promise.resolve(u.trial_used),
    ]);
    return {
      id: String(u.id),
      phone: u.phone,
      name: u.name,
      district: district?.name_bn ?? null,
      status: u.status,
      subscription: {
        is_premium: sub !== null,
        source: sub?.source ?? null,
        ends_at: sub?.ends_at.toISOString() ?? null,
        category_ids: sub && Array.isArray(sub.category_ids) ? sub.category_ids.map(String) : null,
        trial_available: !trialUsedBefore && sub === null,
      },
      devices: devices.map((d) => ({
        platform: d.platform,
        model: d.model,
        last_seen_at: d.last_seen_at?.toISOString() ?? null,
        is_active: d.is_active,
      })),
      attempts_count: attempts,
      created_at: u.created_at.toISOString(),
    };
  }

  async listUsers(q: string | undefined, cursor: string | undefined, limit: number) {
    const before = cursor ? parseId(cursor) : null;
    const term = q?.trim();
    const where: Prisma.usersWhereInput = {
      ...(before ? { id: { lt: before } } : {}),
      ...(term
        ? /^\d+$/.test(term)
          ? { phone: { startsWith: term } }
          : { name: { startsWith: term } }
        : {}),
    };
    const rows = await this.prisma.users.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(await Promise.all(items.map((u) => this.userDto(u))), {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    });
  }

  async userDetail(rawId: string) {
    const u = await this.prisma.users.findUnique({ where: { id: parseId(rawId) } });
    if (!u) throw new ApiException('NOT_FOUND');
    const [base, subs, payments, attempts] = await Promise.all([
      this.userDto(u),
      this.prisma.subscriptions.findMany({
        where: { user_id: u.id },
        include: { packages: { select: { name_bn: true } } },
        orderBy: { id: 'desc' },
        take: 20,
      }),
      this.prisma.payments.findMany({
        where: { user_id: u.id },
        include: { packages: { select: { name_bn: true } } },
        orderBy: { id: 'desc' },
        take: 20,
      }),
      this.prisma.attempts.findMany({
        where: { user_id: u.id },
        orderBy: { started_at: 'desc' },
        take: 20,
      }),
    ]);
    const exams = await this.prisma.exams.findMany({
      where: { id: { in: attempts.flatMap((a) => (a.exam_id ? [a.exam_id] : [])) } },
      select: { id: true, title_bn: true },
    });
    const title = new Map(exams.map((e) => [e.id, e.title_bn]));
    return {
      ...base,
      subscriptions: subs.map((s) => ({
        id: String(s.id),
        package_name: s.packages?.name_bn ?? null,
        source: s.source,
        starts_at: s.starts_at.toISOString(),
        ends_at: s.ends_at.toISOString(),
        note: s.note,
      })),
      payments: payments.map((p) => this.paymentDto(p)),
      recent_attempts: attempts.map((a) => ({
        attempt_id: String(a.id),
        kind: a.kind,
        title: a.exam_id ? (title.get(a.exam_id) ?? '') : 'Practice',
        started_at: a.started_at.toISOString(),
        status: a.status,
        score: a.score === null ? null : num(a.score),
        total_marks: null,
        rank_overall: a.rank_overall,
      })),
    };
  }

  /** FR-ADM-12. Each action has its own permission; the reason is mandatory and lands in the audit log. */
  async userAction(actor: Actor, rawId: string, i: UserActionInput) {
    assertPermission(actor.admin, ACTION_PERMISSION[i.action]);
    const id = parseId(rawId);
    const user = await this.prisma.users.findUnique({ where: { id } });
    if (!user) throw new ApiException('NOT_FOUND');
    let after: Record<string, unknown> = {};

    switch (i.action) {
      case 'reset_device':
        await this.devices.deactivateAll(id);
        await this.prisma.users.update({ where: { id }, data: { device_resets_30d: 0 } });
        await this.redis.client.del(`rl:devreset:${id}`);
        break;
      case 'ban':
        await this.prisma.users.update({ where: { id }, data: { status: 'banned' } });
        await this.devices.deactivateAll(id);
        after = { status: 'banned' };
        break;
      case 'unban':
        await this.prisma.users.update({ where: { id }, data: { status: 'active' } });
        after = { status: 'active' };
        break;
      case 'grant_subscription': {
        if (!i.package_id && !i.days) {
          throw new ApiException('VALIDATION_FAILED', {
            fields: { package_id: 'package_id or days is required' },
          });
        }
        const pkg = i.package_id
          ? await this.prisma.packages.findUnique({ where: { id: Number(parseId(i.package_id)) } })
          : null;
        if (i.package_id && !pkg) {
          throw new ApiException('VALIDATION_FAILED', {
            fields: { package_id: 'unknown package' },
          });
        }
        const days = i.days ?? pkg?.duration_days ?? 0;
        const now = new Date();
        const latest = await this.prisma.subscriptions.aggregate({
          where: { user_id: id, ends_at: { gt: now } },
          _max: { ends_at: true },
        });
        const startsAt =
          latest._max.ends_at && latest._max.ends_at > now ? latest._max.ends_at : now;
        const sub = await this.prisma.subscriptions.create({
          data: {
            user_id: id,
            package_id: pkg?.id ?? null,
            source: 'manual',
            category_ids: pkg?.category_ids ?? undefined,
            starts_at: startsAt,
            ends_at: new Date(startsAt.getTime() + days * DAY_MS),
            granted_by: Number(actor.admin.id),
            note: i.reason.slice(0, 255),
          },
        });
        await this.redis.client.del(subCacheKey(id));
        after = { subscription_id: String(sub.id), ends_at: sub.ends_at.toISOString() };
        break;
      }
    }
    await this.audit.record(actor, {
      action: `user.${i.action}`,
      entityType: 'user',
      entityId: id,
      before: { status: user.status },
      after: { ...after, reason: i.reason },
    });
  }

  // ------------------------------------------------------------------ payments

  private paymentDto(p: {
    id: bigint;
    amount_bdt: Prisma.Decimal;
    discount_bdt: Prisma.Decimal;
    gateway: string;
    status: string;
    gateway_tran_id: string | null;
    created_at: Date;
    paid_at: Date | null;
    packages: { name_bn: string };
  }) {
    return {
      id: String(p.id),
      package_name: p.packages.name_bn,
      amount_bdt: num(p.amount_bdt),
      discount_bdt: num(p.discount_bdt),
      gateway: p.gateway,
      status: p.status,
      gateway_tran_id: p.gateway_tran_id,
      created_at: p.created_at.toISOString(),
      paid_at: p.paid_at?.toISOString() ?? null,
    };
  }

  async listPayments(status: string | undefined, cursor: string | undefined, limit: number) {
    const before = cursor ? parseId(cursor) : null;
    const rows = await this.prisma.payments.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(before ? { id: { lt: before } } : {}),
      },
      include: { packages: { select: { name_bn: true } } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(
      items.map((p) => this.paymentDto(p)),
      { next_cursor: hasMore && last ? String(last.id) : null, has_more: hasMore },
    );
  }

  // ------------------------------------------------------------------ settings

  async getSettings(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.app_settings.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** PATCH: only existing keys can be changed, so a typo cannot create a dead setting. */
  async patchSettings(actor: Actor, patch: Record<string, unknown>) {
    const keys = Object.keys(patch);
    const existing = await this.prisma.app_settings.findMany({ where: { key: { in: keys } } });
    const known = new Set(existing.map((r) => r.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: Object.fromEntries(unknown.map((k) => [k, 'unknown setting'])),
      });
    }
    await this.prisma.$transaction(
      keys.map((key) =>
        this.prisma.app_settings.update({
          where: { key },
          data: { value: patch[key] as Prisma.InputJsonValue, updated_by: Number(actor.admin.id) },
        }),
      ),
    );
    await this.settings.invalidate();
    await this.audit.record(actor, {
      action: 'settings.update',
      entityType: 'settings',
      entityId: keys.join(',').slice(0, 40),
      before: Object.fromEntries(existing.map((r) => [r.key, r.value])),
      after: patch,
    });
    return this.getSettings();
  }
}
