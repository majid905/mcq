import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminApi, RequirePermission, type AdminRequest } from '../admin-auth.guard';
import type { Actor } from '../audit.service';
import { AccountsAdminService } from './accounts-admin.service';

const listQuery = z.object({
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const accountBody = z.object({
  email: z.email().max(190),
  name: z.string().min(1).max(100),
  role_id: z.string().regex(/^\d{1,5}$/),
  password: z.string().min(10).max(200).optional(),
  is_active: z.boolean().optional(),
  reset_totp: z.boolean().optional(),
});
const roleBody = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/),
  permissions: z.array(z.string().max(60)).max(100),
});

/** Admin accounts and roles. Only roles that hold `admins.*` / `roles.*` (in practice: super admin). */
@AdminApi()
@Controller('admin')
export class AccountsAdminController {
  constructor(private readonly accounts: AccountsAdminService) {}

  private actor(req: AdminRequest): Actor {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  @RequirePermission('admins.read')
  @Get('admins')
  listAdmins(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.accounts.listAdmins(q.cursor, q.limit);
  }

  @RequirePermission('admins.write')
  @Post('admins')
  async createAdmin(
    @Body(new ZodValidationPipe(accountBody)) b: z.infer<typeof accountBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.accounts.createAdmin(this.actor(req), b);
  }

  @RequirePermission('admins.write')
  @Put('admins/:id')
  updateAdmin(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(accountBody)) b: z.infer<typeof accountBody>,
    @Req() req: AdminRequest,
  ) {
    return this.accounts.updateAdmin(this.actor(req), id, b);
  }

  @RequirePermission('admins.write')
  @Delete('admins/:id')
  @HttpCode(204)
  async deleteAdmin(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    await this.accounts.deleteAdmin(this.actor(req), id);
  }

  @RequirePermission('roles.read')
  @Get('roles')
  listRoles(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.accounts.listRoles(q.cursor, q.limit);
  }

  @RequirePermission('roles.write')
  @Post('roles')
  async createRole(
    @Body(new ZodValidationPipe(roleBody)) b: z.infer<typeof roleBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.accounts.createRole(this.actor(req), b);
  }

  @RequirePermission('roles.write')
  @Put('roles/:id')
  updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(roleBody)) b: z.infer<typeof roleBody>,
    @Req() req: AdminRequest,
  ) {
    return this.accounts.updateRole(this.actor(req), id, b);
  }

  @RequirePermission('roles.write')
  @Delete('roles/:id')
  @HttpCode(204)
  async deleteRole(@Param('id') id: string, @Req() req: AdminRequest): Promise<void> {
    await this.accounts.deleteRole(this.actor(req), id);
  }
}
