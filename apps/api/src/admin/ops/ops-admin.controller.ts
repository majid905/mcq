import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  AdminApi,
  RequireAnyPermission,
  RequirePermission,
  type AdminRequest,
} from '../admin-auth.guard';
import type { Actor } from '../audit.service';
import { OpsAdminService } from './ops-admin.service';

const userList = z.object({
  q: z.string().max(60).optional(),
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const paymentList = z.object({
  status: z.enum(['initiated', 'pending', 'paid', 'failed', 'cancelled', 'refunded']).optional(),
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const actionBody = z.object({
  action: z.enum(['reset_device', 'ban', 'unban', 'grant_subscription']),
  reason: z.string().min(3).max(255),
  package_id: z
    .string()
    .regex(/^\d{1,10}$/)
    .optional(),
  days: z.number().int().min(1).max(3650).optional(),
});
const settingsBody = z.record(z.string().max(80), z.unknown());

@AdminApi()
@Controller('admin')
export class OpsAdminController {
  constructor(private readonly ops: OpsAdminService) {}

  private actor(req: AdminRequest): Actor {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  /** Any signed-in admin may open the dashboard. */
  @Get('dashboard')
  dashboard() {
    return this.ops.dashboard();
  }

  @RequirePermission('users.read')
  @Get('users')
  users(@Query(new ZodValidationPipe(userList)) q: z.infer<typeof userList>) {
    return this.ops.listUsers(q.q, q.cursor, q.limit);
  }

  @RequirePermission('users.read')
  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.ops.userDetail(id);
  }

  /** The permission depends on the action, so the service checks it (reset_device, ban, grant). */
  @RequireAnyPermission('users.reset_device', 'users.ban', 'users.grant')
  @Post('users/:id/actions')
  @HttpCode(200)
  async action(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(actionBody)) b: z.infer<typeof actionBody>,
    @Req() req: AdminRequest,
  ): Promise<{ ok: true }> {
    await this.ops.userAction(this.actor(req), id, b);
    return { ok: true };
  }

  @RequirePermission('payments.read')
  @Get('payments')
  payments(@Query(new ZodValidationPipe(paymentList)) q: z.infer<typeof paymentList>) {
    return this.ops.listPayments(q.status, q.cursor, q.limit);
  }

  @RequireAnyPermission('settings.read', 'settings.write')
  @Get('settings')
  settings() {
    return this.ops.getSettings();
  }

  @RequirePermission('settings.write')
  @Patch('settings')
  patchSettings(
    @Body(new ZodValidationPipe(settingsBody)) b: z.infer<typeof settingsBody>,
    @Req() req: AdminRequest,
  ) {
    return this.ops.patchSettings(this.actor(req), b);
  }
}
