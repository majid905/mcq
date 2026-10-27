import { Injectable } from '@nestjs/common';
import type { admins, roles } from '@prisma/client';
import { PasswordService } from '../../auth/password.service';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthService } from '../admin-auth.service';
import { hasPermission } from '../admin-auth.guard';
import { AuditService, type Actor } from '../audit.service';

export interface AdminAccountInput {
  email: string;
  name: string;
  role_id: string;
  password?: string | undefined;
  is_active?: boolean | undefined;
  reset_totp?: boolean | undefined;
}

export interface RoleInput {
  name: string;
  permissions: string[];
}

type AdminRow = admins & { roles: roles };

const permsOf = (r: roles): string[] =>
  Array.isArray(r.permissions) ? r.permissions.map(String) : [];

/** FR-ADM-14/15: admin accounts and roles. The rule everywhere: nobody can lock the system out or lift themselves up. */
@Injectable()
export class AccountsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly sessions: AdminAuthService,
  ) {}

  // ------------------------------------------------------------------ admins

  private adminDto(a: AdminRow) {
    return {
      id: String(a.id),
      email: a.email,
      name: a.name,
      role_id: String(a.role_id),
      role_name: a.roles.name,
      is_active: a.is_active,
      totp_enabled: a.totp_secret !== null,
      last_login_at: a.last_login_at?.toISOString() ?? null,
      created_at: a.created_at.toISOString(),
    };
  }

  async listAdmins(cursor: string | undefined, limit: number) {
    const before = cursor ? Number(parseId(cursor)) : null;
    const rows = await this.prisma.admins.findMany({
      where: before ? { id: { lt: before } } : {},
      include: { roles: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(
      items.map((r) => this.adminDto(r)),
      { next_cursor: hasMore && last ? String(last.id) : null, has_more: hasMore },
    );
  }

  /** You can only hand out a role whose permissions you hold yourself (a super admin holds all). */
  private assertCanGrant(actor: Actor, role: roles): void {
    const mine = actor.admin.permissions;
    if (mine.includes('*')) return;
    if (permsOf(role).some((p) => !hasPermission(mine, p))) {
      throw new ApiException('FORBIDDEN', { reason: 'role exceeds your own permissions' });
    }
  }

  private async activeSuperAdmins(exceptId?: number): Promise<number> {
    return this.prisma.admins.count({
      where: {
        is_active: true,
        roles: { name: 'super_admin' },
        ...(exceptId === undefined ? {} : { NOT: { id: exceptId } }),
      },
    });
  }

  async createAdmin(actor: Actor, i: AdminAccountInput) {
    if (!i.password) {
      throw new ApiException('VALIDATION_FAILED', { fields: { password: 'required' } });
    }
    const role = await this.prisma.roles.findUnique({ where: { id: Number(parseId(i.role_id)) } });
    if (!role) throw new ApiException('VALIDATION_FAILED', { fields: { role_id: 'unknown role' } });
    this.assertCanGrant(actor, role);
    const email = i.email.trim().toLowerCase();
    if (await this.prisma.admins.findUnique({ where: { email } })) {
      throw new ApiException('CONFLICT', { field: 'email' }, 'এই ইমেইল আগে থেকেই আছে');
    }
    const row = await this.prisma.admins.create({
      data: {
        email,
        name: i.name,
        role_id: role.id,
        is_active: i.is_active ?? true,
        password_hash: await this.passwords.hash(i.password),
      },
      include: { roles: true },
    });
    await this.audit.record(actor, {
      action: 'admin.create',
      entityType: 'admin',
      entityId: row.id,
      after: this.adminDto(row),
    });
    return this.adminDto(row);
  }

  async updateAdmin(actor: Actor, rawId: string, i: AdminAccountInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.admins.findUnique({ where: { id }, include: { roles: true } });
    if (!before) throw new ApiException('NOT_FOUND');
    const role = await this.prisma.roles.findUnique({ where: { id: Number(parseId(i.role_id)) } });
    if (!role) throw new ApiException('VALIDATION_FAILED', { fields: { role_id: 'unknown role' } });
    this.assertCanGrant(actor, role);

    const isSelf = BigInt(id) === actor.admin.id;
    const active = i.is_active ?? before.is_active;
    if (isSelf && (!active || role.id !== before.role_id)) {
      throw new ApiException(
        'CONFLICT',
        undefined,
        'নিজের ভূমিকা বা সক্রিয় অবস্থা বদলানো যাবে না',
      );
    }
    if (
      before.roles.name === 'super_admin' &&
      (!active || role.name !== 'super_admin') &&
      (await this.activeSuperAdmins(id)) === 0
    ) {
      throw new ApiException('CONFLICT', undefined, 'শেষ সুপার অ্যাডমিনকে সরানো যাবে না');
    }
    const email = i.email.trim().toLowerCase();
    const clash = await this.prisma.admins.findUnique({ where: { email } });
    if (clash && clash.id !== id) throw new ApiException('CONFLICT', { field: 'email' });

    const row = await this.prisma.admins.update({
      where: { id },
      data: {
        email,
        name: i.name,
        role_id: role.id,
        is_active: active,
        ...(i.password ? { password_hash: await this.passwords.hash(i.password) } : {}),
        ...(i.reset_totp ? { totp_secret: null } : {}),
      },
      include: { roles: true },
    });
    await this.sessions.forget(id);
    await this.audit.record(actor, {
      action: 'admin.update',
      entityType: 'admin',
      entityId: id,
      before: this.adminDto(before),
      // Never log the password; say only that it was reset.
      after: { ...this.adminDto(row), password_reset: Boolean(i.password) },
    });
    return this.adminDto(row);
  }

  async deleteAdmin(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    if (BigInt(id) === actor.admin.id) {
      throw new ApiException('CONFLICT', undefined, 'নিজের অ্যাকাউন্ট মুছা যাবে না');
    }
    const before = await this.prisma.admins.findUnique({ where: { id }, include: { roles: true } });
    if (!before) throw new ApiException('NOT_FOUND');
    if (before.roles.name === 'super_admin' && (await this.activeSuperAdmins(id)) === 0) {
      throw new ApiException('CONFLICT', undefined, 'শেষ সুপার অ্যাডমিনকে মুছা যাবে না');
    }
    await this.prisma.admins.delete({ where: { id } });
    await this.sessions.forget(id);
    await this.audit.record(actor, {
      action: 'admin.delete',
      entityType: 'admin',
      entityId: id,
      before: this.adminDto(before),
    });
  }

  // ------------------------------------------------------------------ roles

  private async roleDto(r: roles) {
    return {
      id: String(r.id),
      name: r.name,
      permissions: permsOf(r),
      admins_count: await this.prisma.admins.count({ where: { role_id: r.id } }),
    };
  }

  async listRoles(cursor: string | undefined, limit: number) {
    const after = cursor ? Number(parseId(cursor)) : 0;
    const rows = await this.prisma.roles.findMany({
      where: { id: { gt: after } },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(await Promise.all(items.map((r) => this.roleDto(r))), {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    });
  }

  private checkPermissions(actor: Actor, permissions: string[]): string[] {
    const clean = [...new Set(permissions)];
    for (const p of clean) {
      if (p !== '*' && !/^[a-z_]+\.[a-z_]+$/.test(p)) {
        throw new ApiException('VALIDATION_FAILED', {
          fields: { permissions: `bad permission ${p}` },
        });
      }
      if (!hasPermission(actor.admin.permissions, p)) {
        throw new ApiException('FORBIDDEN', { reason: `you do not hold ${p}` });
      }
    }
    return clean;
  }

  async createRole(actor: Actor, i: RoleInput) {
    const permissions = this.checkPermissions(actor, i.permissions);
    if (await this.prisma.roles.findUnique({ where: { name: i.name } })) {
      throw new ApiException('CONFLICT', { field: 'name' });
    }
    const row = await this.prisma.roles.create({ data: { name: i.name, permissions } });
    const dto = await this.roleDto(row);
    await this.audit.record(actor, {
      action: 'role.create',
      entityType: 'role',
      entityId: row.id,
      after: dto,
    });
    return dto;
  }

  async updateRole(actor: Actor, rawId: string, i: RoleInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.roles.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    if (before.name === 'super_admin') {
      throw new ApiException('CONFLICT', undefined, 'সুপার অ্যাডমিন ভূমিকা বদলানো যাবে না');
    }
    const permissions = this.checkPermissions(actor, i.permissions);
    const clash = await this.prisma.roles.findUnique({ where: { name: i.name } });
    if (clash && clash.id !== id) throw new ApiException('CONFLICT', { field: 'name' });
    const beforeDto = await this.roleDto(before);
    const row = await this.prisma.roles.update({
      where: { id },
      data: { name: i.name, permissions },
    });
    const holders = await this.prisma.admins.findMany({
      where: { role_id: id },
      select: { id: true },
    });
    await Promise.all(holders.map((h) => this.sessions.forget(h.id)));
    const dto = await this.roleDto(row);
    await this.audit.record(actor, {
      action: 'role.update',
      entityType: 'role',
      entityId: id,
      before: beforeDto,
      after: dto,
    });
    return dto;
  }

  async deleteRole(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    const before = await this.prisma.roles.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    if (before.name === 'super_admin') {
      throw new ApiException('CONFLICT', undefined, 'সুপার অ্যাডমিন ভূমিকা মুছা যাবে না');
    }
    const holders = await this.prisma.admins.count({ where: { role_id: id } });
    if (holders > 0) throw new ApiException('IN_USE', { admins: holders });
    const beforeDto = await this.roleDto(before);
    await this.prisma.roles.delete({ where: { id } });
    await this.audit.record(actor, {
      action: 'role.delete',
      entityType: 'role',
      entityId: id,
      before: beforeDto,
    });
  }
}
