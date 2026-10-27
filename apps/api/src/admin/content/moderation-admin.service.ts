import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { NotificationService, type Template } from '../../notifications/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../audit.service';
import { QuestionsAdminService } from './questions-admin.service';

export type BroadcastSegment = 'all' | 'premium' | 'free' | 'inactive_7d';

export interface BroadcastInput {
  title: string;
  body: string;
  deep_link?: string | undefined;
  category_ids?: string[] | undefined;
  segment?: BroadcastSegment | undefined;
}

const reportAccepted = (note: string | undefined): Template => ({
  type: 'report',
  bn: {
    title: 'আপনার রিপোর্ট গৃহীত হয়েছে',
    body: note ? `ধন্যবাদ! প্রশ্নটি সংশোধন করা হবে। ${note}` : 'ধন্যবাদ! প্রশ্নটি সংশোধন করা হবে।',
  },
  en: {
    title: 'Your report was accepted',
    body: note
      ? `Thanks! The question will be fixed. ${note}`
      : 'Thanks! The question will be fixed.',
  },
});

/** Question reports (FR-ADM-08) and notification broadcasts (FR-NOTI-01). */
@Injectable()
export class ModerationAdminService implements OnModuleDestroy {
  private readonly logger = new Logger(ModerationAdminService.name);
  /** Segment sends still running in the background. */
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly questions: QuestionsAdminService,
    private readonly notifications: NotificationService,
  ) {}

  async listReports(
    status: 'open' | 'accepted' | 'rejected',
    cursor: string | undefined,
    limit: number,
  ) {
    const before = cursor ? parseId(cursor) : null;
    const rows = await this.prisma.question_reports.findMany({
      where: { status, ...(before ? { id: { lt: before } } : {}) },
      include: { users: { select: { name: true } } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const data = await Promise.all(
      items.map(async (r) => ({
        id: String(r.id),
        question: await this.questions.get(String(r.question_id)),
        reason: r.reason,
        message: r.message,
        reporter_name: r.users.name,
        created_at: r.created_at.toISOString(),
      })),
    );
    return new Page(data, {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    });
  }

  async resolveReport(
    actor: Actor,
    rawId: string,
    status: 'accepted' | 'rejected',
    note: string | undefined,
  ): Promise<void> {
    const id = parseId(rawId);
    const report = await this.prisma.question_reports.findUnique({ where: { id } });
    if (!report) throw new ApiException('NOT_FOUND');
    // Compare-and-set: two moderators resolving at once cannot both notify the reporter.
    const claimed = await this.prisma.question_reports.updateMany({
      where: { id, status: 'open' },
      data: {
        status,
        resolved_by: Number(actor.admin.id),
        resolution_note: note?.slice(0, 1000) ?? null,
        resolved_at: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ApiException('CONFLICT', undefined, 'রিপোর্টটি ইতোমধ্যে নিষ্পত্তি হয়েছে');
    }
    if (status === 'accepted') {
      await this.notifications
        .notify(report.user_id, reportAccepted(note))
        .catch((e: Error) => this.logger.warn(`report notice failed: ${e.message}`));
    }
    await this.audit.record(actor, {
      action: `report.${status}`,
      entityType: 'report',
      entityId: id,
      before: { status: 'open' },
      after: { status, note: note ?? null, question_id: String(report.question_id) },
    });
  }

  // ------------------------------------------------------------------ broadcast

  /**
   * `all` and category broadcasts are one inbox row plus a topic push (clients subscribe to `all` and
   * `cat_<id>`). Segments need a user list, so those go row by row in the background.
   */
  async broadcast(actor: Actor, i: BroadcastInput): Promise<void> {
    const tpl: Template = {
      type: 'broadcast',
      bn: { title: i.title, body: i.body },
      en: { title: i.title, body: i.body },
      ...(i.deep_link ? { deepLink: i.deep_link } : {}),
    };
    const segment = i.segment ?? 'all';
    if (segment === 'all') {
      const topics = i.category_ids?.length
        ? i.category_ids.map((c) => `cat_${Number(parseId(c))}`)
        : ['all'];
      await this.notifications.broadcast(tpl, topics[0] as string);
      for (const extra of topics.slice(1)) {
        await this.notifications.pushTopic(extra, tpl).catch(() => undefined);
      }
    } else {
      // Fire and forget: thousands of users take a while and the admin should not wait.
      const job = this.sendToSegment(segment, tpl)
        .catch((e: Error) => this.logger.error('segment broadcast failed: ' + e.message))
        .finally(() => this.pending.delete(job));
      this.pending.add(job);
    }
    await this.audit.record(actor, {
      action: 'notification.broadcast',
      entityType: 'notification',
      entityId: `segment:${segment}`,
      after: { title: i.title, body: i.body, segment, category_ids: i.category_ids ?? [] },
    });
  }

  /** Resolves when no segment broadcast is running (shutdown, tests). */
  async idle(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.idle();
  }

  private async sendToSegment(
    segment: Exclude<BroadcastSegment, 'all'>,
    tpl: Template,
  ): Promise<void> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    let after = 0n;
    for (;;) {
      const users = await this.prisma.users.findMany({
        where: {
          id: { gt: after },
          status: 'active',
          ...(segment === 'premium' || segment === 'free'
            ? {
                subscriptions:
                  segment === 'premium'
                    ? { some: { starts_at: { lte: now }, ends_at: { gt: now } } }
                    : { none: { starts_at: { lte: now }, ends_at: { gt: now } } },
              }
            : { OR: [{ last_active_at: null }, { last_active_at: { lt: sevenDaysAgo } }] }),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 2000,
      });
      if (users.length === 0) return;
      await this.notifications.notifyMany(
        users.map((u) => u.id),
        tpl,
      );
      after = (users[users.length - 1] as { id: bigint }).id;
    }
  }
}
