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
import { WithMeta } from '../../common/page';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import {
  AdminApi,
  RequireAnyPermission,
  RequirePermission,
  type AdminRequest,
} from '../admin-auth.guard';
import type { Actor } from '../audit.service';
import { ModerationAdminService } from './moderation-admin.service';
import { QuestionsAdminService } from './questions-admin.service';
import { TaxonomyAdminService } from './taxonomy-admin.service';

const id = z.string().regex(/^\d{1,19}$/);
const cursor = z.string().max(20).optional();
const limit = z.coerce.number().int().min(1).max(100).default(20);

const questionList = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['draft', 'in_review', 'published', 'archived']).optional(),
  node_id: id.optional(),
  source_exam_id: id.optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  cursor,
  limit,
});
const questionBody = z.object({
  body: z.string().min(1).max(100_000),
  options: z
    .array(
      z.object({
        key: z.enum(['a', 'b', 'c', 'd', 'e']),
        html: z.string().min(1).max(20_000),
      }),
    )
    .min(4)
    .max(5),
  correct_option: z.enum(['a', 'b', 'c', 'd', 'e']),
  explanation: z.string().max(100_000).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  status: z.enum(['draft', 'in_review', 'published', 'archived']).optional(),
  primary_node_id: id,
  node_ids: z.array(id).max(50).optional(),
  source_exam_id: id.optional(),
  source_year: z.number().int().min(1950).max(2100).optional(),
  is_premium: z.boolean().optional(),
});
const bulkBody = z.object({
  ids: z.array(id).min(1).max(1000),
  action: z.enum(['publish', 'archive', 'send_to_review', 'add_tag', 'remove_tag']),
  node_id: id.optional(),
});
const taxonomyBody = z.object({
  parent_id: id.nullable().optional(),
  type: z.enum(['category', 'subject', 'chapter', 'topic']),
  name_bn: z.string().min(1).max(150),
  name_en: z.string().min(1).max(150),
  slug: z.string().max(160).optional(),
  sort_order: z.number().int().optional(),
  icon: z.string().max(50).optional(),
  is_active: z.boolean().optional(),
});
const reorderBody = z.object({
  items: z
    .array(z.object({ id, parent_id: id.nullable(), sort_order: z.number().int() }))
    .min(1)
    .max(500),
});
const reportList = z.object({
  status: z.enum(['open', 'accepted', 'rejected']).default('open'),
  cursor,
  limit,
});
const resolveBody = z.object({
  status: z.enum(['accepted', 'rejected']),
  note: z.string().max(1000).optional(),
});
const broadcastBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  deep_link: z.string().max(300).optional(),
  category_ids: z.array(id).max(20).optional(),
  segment: z.enum(['all', 'premium', 'free', 'inactive_7d']).optional(),
});

/** Question bank, taxonomy, reports and broadcasts (admin screens L3..L8, L10). */
@AdminApi()
@Controller('admin')
export class ContentAdminController {
  constructor(
    private readonly questions: QuestionsAdminService,
    private readonly taxonomy: TaxonomyAdminService,
    private readonly moderation: ModerationAdminService,
  ) {}

  private actor(req: AdminRequest): Actor {
    return { admin: req.admin as NonNullable<AdminRequest['admin']>, ip: req.ip };
  }

  // ---- questions

  @RequireAnyPermission('questions.read', 'questions.write', 'questions.review')
  @Get('questions')
  listQuestions(@Query(new ZodValidationPipe(questionList)) q: z.infer<typeof questionList>) {
    return this.questions.list(
      {
        q: q.q,
        status: q.status,
        nodeId: q.node_id,
        sourceExamId: q.source_exam_id,
        difficulty: q.difficulty,
      },
      q.cursor,
      q.limit,
    );
  }

  @RequirePermission('questions.write')
  @Post('questions')
  async createQuestion(
    @Body(new ZodValidationPipe(questionBody)) b: z.infer<typeof questionBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    const { dto, near } = await this.questions.create(this.actor(req), b);
    return new WithMeta(dto, { near_duplicates: near });
  }

  // `bulk` before `:id` so it is not read as an id.
  @Post('questions/bulk')
  @HttpCode(200)
  bulk(
    @Body(new ZodValidationPipe(bulkBody)) b: z.infer<typeof bulkBody>,
    @Req() req: AdminRequest,
  ) {
    return this.questions.bulk(this.actor(req), b.ids, b.action, b.node_id);
  }

  @RequireAnyPermission('questions.read', 'questions.write', 'questions.review')
  @Get('questions/:id')
  getQuestion(@Param('id') raw: string) {
    return this.questions.get(raw);
  }

  @RequirePermission('questions.write')
  @Put('questions/:id')
  async updateQuestion(
    @Param('id') raw: string,
    @Body(new ZodValidationPipe(questionBody)) b: z.infer<typeof questionBody>,
    @Req() req: AdminRequest,
  ) {
    const { dto } = await this.questions.update(this.actor(req), raw, b);
    return dto;
  }

  // ---- taxonomy

  @RequirePermission('taxonomy.write')
  @Post('taxonomy')
  async createNode(
    @Body(new ZodValidationPipe(taxonomyBody)) b: z.infer<typeof taxonomyBody>,
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.status(201);
    return this.taxonomy.create(this.actor(req), b);
  }

  @RequirePermission('taxonomy.write')
  @Post('taxonomy/reorder')
  @HttpCode(204)
  async reorder(
    @Body(new ZodValidationPipe(reorderBody)) b: z.infer<typeof reorderBody>,
    @Req() req: AdminRequest,
  ): Promise<void> {
    await this.taxonomy.reorder(this.actor(req), b.items);
  }

  @RequirePermission('taxonomy.write')
  @Put('taxonomy/:id')
  updateNode(
    @Param('id') raw: string,
    @Body(new ZodValidationPipe(taxonomyBody)) b: z.infer<typeof taxonomyBody>,
    @Req() req: AdminRequest,
  ) {
    return this.taxonomy.update(this.actor(req), raw, b);
  }

  @RequirePermission('taxonomy.write')
  @Delete('taxonomy/:id')
  @HttpCode(204)
  async deleteNode(@Param('id') raw: string, @Req() req: AdminRequest): Promise<void> {
    await this.taxonomy.remove(this.actor(req), raw);
  }

  // ---- reports

  @RequireAnyPermission('reports.read', 'reports.resolve')
  @Get('reports')
  reports(@Query(new ZodValidationPipe(reportList)) q: z.infer<typeof reportList>) {
    return this.moderation.listReports(q.status, q.cursor, q.limit);
  }

  @RequirePermission('reports.resolve')
  @Post('reports/:id/resolve')
  @HttpCode(200)
  async resolve(
    @Param('id') raw: string,
    @Body(new ZodValidationPipe(resolveBody)) b: z.infer<typeof resolveBody>,
    @Req() req: AdminRequest,
  ): Promise<{ ok: true }> {
    await this.moderation.resolveReport(this.actor(req), raw, b.status, b.note);
    return { ok: true };
  }

  // ---- broadcast

  @RequirePermission('notifications.send')
  @Post('notifications/broadcast')
  @HttpCode(202)
  async broadcast(
    @Body(new ZodValidationPipe(broadcastBody)) b: z.infer<typeof broadcastBody>,
    @Req() req: AdminRequest,
  ): Promise<{ queued: true }> {
    await this.moderation.broadcast(this.actor(req), b);
    return { queued: true };
  }
}
