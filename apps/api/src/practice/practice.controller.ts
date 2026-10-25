import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { PracticeService } from './practice.service';

const id = z.string().regex(/^\d{1,19}$/, 'must be a numeric id');

const createSchema = z.object({
  mode: z.enum(['quick', 'custom', 'bookmarks', 'wrong']),
  node_ids: z.array(id).max(10).optional(),
  question_count: z.number().int().min(5).max(200).default(20),
  duration_sec: z.number().int().min(60).max(21_600).nullable().optional(),
  difficulty: z.enum(['easy', 'mixed', 'hard']).default('mixed'),
  exclude_seen: z.boolean().default(false),
});

const answerSchema = z.object({
  question_id: id,
  option: z.enum(['a', 'b', 'c', 'd', 'e']),
});

@Controller('practice/sessions')
export class PracticeController {
  constructor(
    private readonly practice: PracticeService,
    private readonly prisma: PrismaService,
  ) {}

  private async user(auth: AuthUser) {
    const user = await this.prisma.users.findUnique({
      where: { id: auth.userId },
      select: { id: true, locale: true, district_id: true, status: true },
    });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return user;
  }

  @Post()
  async create(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.practice.create(await this.user(auth), {
      mode: body.mode,
      ...(body.node_ids ? { node_ids: body.node_ids } : {}),
      question_count: body.question_count,
      ...(body.duration_sec !== undefined ? { duration_sec: body.duration_sec } : {}),
      difficulty: body.difficulty,
      exclude_seen: body.exclude_seen,
    });
  }

  @Post(':id/answer')
  @HttpCode(200)
  async answer(
    @CurrentUser() auth: AuthUser,
    @Param('id') attemptId: string,
    @Body(new ZodValidationPipe(answerSchema)) body: z.infer<typeof answerSchema>,
  ) {
    return this.practice.answer(
      await this.user(auth),
      parseId(attemptId),
      body.question_id,
      body.option,
    );
  }
}
