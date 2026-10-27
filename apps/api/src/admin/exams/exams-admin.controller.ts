import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  AdminApi,
  RequireAnyPermission,
  RequirePermission,
  type AdminRequest,
} from '../admin-auth.guard';
import type { Actor } from '../audit.service';
import { ExamsAdminService } from './exams-admin.service';

const id = z.string().regex(/^\d{1,19}$/);
const when = z.iso.datetime().nullable().optional();
const listQuery = z.object({
  cursor: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const examBody = z.object({
  type: z.enum(['live', 'model', 'previous_year']),
  category_id: id,
  title_bn: z.string().min(1).max(255),
  title_en: z.string().min(1).max(255),
  description: z.string().max(10_000).optional(),
  start_at: when,
  end_at: when,
  duration_sec: z.number().int().min(60).max(86_400),
  question_count: z.number().int().min(1).max(500),
  mark_per_question: z.number().min(0.01).max(99),
  negative_mark: z.number().min(0).max(99),
  pass_marks: z.number().min(0).max(100_000).optional(),
  is_premium: z.boolean().optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  result_publish_at: z.iso.datetime().optional(),
  source_exam_id: id.optional(),
  blueprint: z
    .object({
      rules: z
        .array(
          z.object({
            node_id: id,
            count: z.number().int().min(1).max(500),
            difficulty_mix: z
              .object({
                easy: z.number().int().min(0).max(1000).optional(),
                medium: z.number().int().min(0).max(1000).optional(),
                hard: z.number().int().min(0).max(1000).optional(),
              })
              .optional(),
          }),
        )
        .max(50)
        .optional(),
      exclude_used_in_last_exams: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});
const paperBody = z.object({ question_ids: z.array(id).max(500) });

@AdminApi()
@Controller('admin/exams')
export class ExamsAdminController {
  constructor(private readonly exams: ExamsAdminService) {}

  private actor(req: AdminRequest): Actor {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  @RequireAnyPermission('exams.read', 'exams.write')
  @Get()
  list(@Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.exams.list(q.cursor, q.limit);
  }

  @RequirePermission('exams.write')
  @Post()
  async create(
    @Body(new ZodValidationPipe(examBody)) b: z.infer<typeof examBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.exams.create(this.actor(req), b);
  }

  @RequireAnyPermission('exams.read', 'exams.write')
  @Get(':id')
  get(@Param('id') raw: string) {
    return this.exams.get(raw);
  }

  @RequirePermission('exams.write')
  @Put(':id')
  update(
    @Param('id') raw: string,
    @Body(new ZodValidationPipe(examBody)) b: z.infer<typeof examBody>,
    @Req() req: AdminRequest,
  ) {
    return this.exams.update(this.actor(req), raw, b);
  }

  @RequireAnyPermission('exams.read', 'exams.write')
  @Get(':id/questions')
  paper(@Param('id') raw: string) {
    return this.exams.paper(raw);
  }

  @RequirePermission('exams.write')
  @Put(':id/questions')
  async setPaper(
    @Param('id') raw: string,
    @Body(new ZodValidationPipe(paperBody)) b: z.infer<typeof paperBody>,
    @Req() req: AdminRequest,
  ): Promise<{ saved: number }> {
    await this.exams.setPaper(this.actor(req), raw, b.question_ids);
    return { saved: b.question_ids.length };
  }

  @RequirePermission('exams.write')
  @Post(':id/generate')
  @HttpCode(200)
  generate(@Param('id') raw: string) {
    return this.exams.generate(raw);
  }

  @RequirePermission('exams.publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') raw: string, @Req() req: AdminRequest) {
    return this.exams.publish(this.actor(req), raw);
  }

  @RequirePermission('exams.publish')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id') raw: string, @Req() req: AdminRequest) {
    return this.exams.unpublish(this.actor(req), raw);
  }

  @RequireAnyPermission('exams.read', 'exams.write')
  @Get(':id/monitor')
  monitor(@Param('id') raw: string) {
    return this.exams.monitor(raw);
  }
}
