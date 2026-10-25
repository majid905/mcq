import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminApi, AdminPublic, RequirePermission, type AdminRequest } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from './audit.service';

const loginBody = z.object({
  email: z.email().max(190),
  password: z.string().min(1).max(200),
  totp: z
    .string()
    .regex(/^[0-9]{6}$/)
    .optional(),
});
const tokenBody = z.object({ refresh_token: z.string().min(10).max(200) });
const totpBody = z.object({ code: z.string().regex(/^[0-9]{6}$/) });
const auditQuery = z.object({
  entity_type: z.string().max(50).optional(),
  entity_id: z.string().max(40).optional(),
  admin_id: z
    .string()
    .regex(/^\d{1,10}$/)
    .optional(),
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@AdminApi()
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  @AdminPublic()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginBody)) b: z.infer<typeof loginBody>, @Req() req: Request) {
    return this.auth.login(b.email, b.password, b.totp, req.ip ?? 'unknown');
  }

  @AdminPublic()
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(tokenBody)) b: z.infer<typeof tokenBody>) {
    return this.auth.refresh(b.refresh_token);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(tokenBody)) b: z.infer<typeof tokenBody>,
  ): Promise<void> {
    await this.auth.logout(b.refresh_token);
  }

  @Get('me')
  me(@Req() req: AdminRequest) {
    return this.auth.profile(req.admin?.id ?? 0n);
  }

  @Post('auth/totp/setup')
  @HttpCode(200)
  totpSetup(@Req() req: AdminRequest) {
    return this.auth.totpSetup(req.admin?.id ?? 0n);
  }

  @Post('auth/totp/enable')
  @HttpCode(204)
  async totpEnable(
    @Body(new ZodValidationPipe(totpBody)) b: z.infer<typeof totpBody>,
    @Req() req: AdminRequest,
  ): Promise<void> {
    await this.auth.totpEnable(req.admin?.id ?? 0n, b.code);
  }

  @RequirePermission('audit.read')
  @Get('audit-logs')
  auditLogs(@Query(new ZodValidationPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    return this.audit.list(
      {
        ...(q.entity_type ? { entityType: q.entity_type } : {}),
        ...(q.entity_id ? { entityId: q.entity_id } : {}),
        ...(q.admin_id ? { adminId: q.admin_id } : {}),
      },
      q.cursor,
      q.limit,
    );
  }
}
