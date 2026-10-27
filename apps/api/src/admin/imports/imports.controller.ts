import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminApi, hasPermission, RequirePermission, type AdminRequest } from '../admin-auth.guard';
import { ImportsService } from './imports.service';
import { FIELDS } from './mapping';

const createBody = z.object({
  file_url: z.string().min(10).max(500),
  file_name: z.string().min(1).max(255),
});
const validateBody = z.object({
  mapping: z.partialRecord(z.enum(FIELDS), z.string().min(1).max(200)),
  default_status: z.enum(['draft', 'in_review', 'published']).default('in_review'),
});
const listQuery = z.object({
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Imports belong to the admin who started them; roles with `*` can see everyone's. */
@AdminApi()
@RequirePermission('questions.import')
@Controller('admin/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  private actor(req: AdminRequest) {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  private seeAll = (req: AdminRequest) =>
    hasPermission(req.admin?.permissions ?? [], 'imports.read_all');

  @Get()
  list(
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
    @Req() req: AdminRequest,
  ) {
    return this.imports.list(this.actor(req), this.seeAll(req), q.cursor, q.limit);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createBody)) b: z.infer<typeof createBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.imports.create(this.actor(req), b.file_url, b.file_name);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.imports.get(this.actor(req), id, this.seeAll(req));
  }

  @Post(':id/validate')
  @HttpCode(202)
  async validate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(validateBody)) b: z.infer<typeof validateBody>,
    @Req() req: AdminRequest,
  ): Promise<{ queued: true }> {
    await this.imports.startValidate(this.actor(req), id, b.mapping, b.default_status);
    return { queued: true };
  }

  @Post(':id/run')
  @HttpCode(202)
  async run(@Param('id') id: string, @Req() req: AdminRequest): Promise<{ queued: true }> {
    await this.imports.startRun(this.actor(req), id);
    return { queued: true };
  }
}
