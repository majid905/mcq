import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../auth/public.decorator';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { AdminAuthService, type AdminContext } from './admin-auth.service';

export type AdminRequest = Request & { admin?: AdminContext };

const PERMISSIONS = 'adminPermissions';
const PUBLIC_ADMIN = 'adminPublic';

/** `*` is the super admin; otherwise the exact permission string must be in the role. */
export const hasPermission = (granted: readonly string[], needed: string): boolean =>
  granted.includes('*') || granted.includes(needed);

/**
 * Put on every admin controller. The global student guard steps aside (IS_PUBLIC) and
 * AdminAuthGuard authenticates with an admin token instead. Student tokens are refused here.
 */
export const AdminApi = () =>
  applyDecorators(SetMetadata(IS_PUBLIC, true), UseGuards(AdminAuthGuard));

/** Admin route without a token (login, refresh). Use together with `@AdminApi()` on the class. */
export const AdminPublic = () => SetMetadata(PUBLIC_ADMIN, true);

/** Permission string(s) the role must hold, e.g. `@RequirePermission('packages.write')`. All are required. */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS, permissions);

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly admins: AdminAuthService,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ADMIN, targets)) return true;

    const req = context.switchToHttp().getRequest<AdminRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const adminId = token ? this.admins.verifyAccess(token) : null;
    if (adminId === null) throw new ApiException('UNAUTHENTICATED');

    const ctx = await this.admins.context(adminId);
    if (!ctx) throw new ApiException('UNAUTHENTICATED');
    await this.limits.assert(`admin:${adminId}`, 600, 60);

    const needed = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS, targets);
    if (needed && !needed.every((p) => hasPermission(ctx.permissions, p))) {
      throw new ApiException('FORBIDDEN', { required: needed });
    }
    req.admin = ctx;
    return true;
  }
}
