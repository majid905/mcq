import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Page } from '../common/page';
import { parseId } from '../common/ids';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminContext } from './admin-auth.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string | number | bigint;
  before?: unknown;
  after?: unknown;
}

/** What a handler knows about the caller. */
export interface Actor {
  admin: AdminContext;
  ip?: string | undefined;
}

/** Audit rows need only the id, so background jobs can write them on behalf of the admin who started them. */
export interface AuditActor {
  admin: Pick<AdminContext, 'id'>;
  ip?: string | undefined;
}

const toJson = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v === null
    ? Prisma.JsonNull
    : (JSON.parse(
        JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x)),
      ) as Prisma.InputJsonValue);

/** FR-ADM-13: every admin write leaves a before/after row. Services call this next to the write. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(actor: AuditActor, e: AuditEntry): Promise<void> {
    await this.prisma.audit_logs.create({
      data: {
        admin_id: Number(actor.admin.id),
        action: e.action,
        entity_type: e.entityType,
        entity_id: String(e.entityId),
        before_data: e.before === undefined ? undefined : toJson(e.before),
        after_data: e.after === undefined ? undefined : toJson(e.after),
        ip: actor.ip?.slice(0, 45) ?? null,
      },
    });
  }

  async list(
    f: { entityType?: string; entityId?: string; adminId?: string },
    cursor: string | undefined,
    limit: number,
  ) {
    const before = cursor ? parseId(cursor) : null;
    const rows = await this.prisma.audit_logs.findMany({
      where: {
        ...(f.entityType ? { entity_type: f.entityType } : {}),
        ...(f.entityId ? { entity_id: f.entityId } : {}),
        ...(f.adminId ? { admin_id: Number(parseId(f.adminId)) } : {}),
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const adminIds = [
      ...new Set(page.map((r) => r.admin_id).filter((i): i is number => i !== null)),
    ];
    const admins = adminIds.length
      ? await this.prisma.admins.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(admins.map((a) => [a.id, a.name]));
    const last = page[page.length - 1];
    return new Page(
      page.map((r) => ({
        id: String(r.id),
        admin_id: r.admin_id === null ? null : String(r.admin_id),
        admin_name: r.admin_id === null ? null : (names.get(r.admin_id) ?? null),
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        before: r.before_data,
        after: r.after_data,
        ip: r.ip,
        created_at: r.created_at.toISOString(),
      })),
      { next_cursor: hasMore && last ? String(last.id) : null, has_more: hasMore },
    );
  }
}
