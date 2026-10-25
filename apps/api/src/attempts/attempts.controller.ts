import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { startBodySchema, type StartBody } from '../exams/exams.schemas';
import { ExamsService } from '../exams/exams.service';
import { PrismaService } from '../prisma/prisma.service';
import { answerSyncSchema, type AnswerSyncDto } from './attempts.schemas';
import { AttemptsService } from './attempts.service';
import { LeaderboardService } from './leaderboard.service';
import { ResultsService } from './results.service';

const solutionsQuery = z.object({
  filter: z.enum(['all', 'wrong', 'skipped', 'correct']).default('all'),
});
const leaderboardQuery = z.object({ scope: z.enum(['overall', 'district']).default('overall') });
const historyQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  kind: z
    .enum(['live', 'live_practice', 'model', 'previous_year', 'custom', 'quick_practice'])
    .optional(),
});

@Controller()
export class AttemptsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly results: ResultsService,
    private readonly board: LeaderboardService,
    private readonly exams: ExamsService,
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

  @Post('exams/:id/start')
  async start(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Headers('x-platform') platform: string | undefined,
    @Body(new ZodValidationPipe(startBodySchema)) body: StartBody,
  ) {
    const user = await this.user(auth);
    const exam = await this.exams.visible(parseId(id));
    return this.attempts.start(user, exam, body.mode, platform);
  }

  @Put('attempts/:id/answers')
  sync(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(answerSyncSchema)) body: AnswerSyncDto,
  ) {
    return this.attempts.sync(auth.userId, parseId(id), body);
  }

  @Post('attempts/:id/submit')
  @HttpCode(202)
  submit(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(answerSyncSchema)) body: AnswerSyncDto,
  ) {
    return this.attempts.submit(auth.userId, parseId(id), body);
  }

  /** 200 with the result, or an empty 202 while the scoring worker has not finished (FR-RES-01). */
  @Get('attempts/:id/result')
  async result(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.results.result(await this.user(auth), parseId(id));
    if (result === null) {
      res.status(202);
      return undefined;
    }
    return result;
  }

  @Get('attempts/:id/solutions')
  solutions(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(solutionsQuery)) q: z.infer<typeof solutionsQuery>,
  ) {
    return this.results.solutions(auth.userId, parseId(id), q.filter);
  }

  @Get('exams/:id/leaderboard')
  async leaderboard(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(leaderboardQuery)) q: z.infer<typeof leaderboardQuery>,
  ) {
    const user = await this.user(auth);
    const exam = await this.exams.visible(parseId(id));
    return this.board.get(user, exam.id, exam.status === 'merit_published', q.scope);
  }

  @Get('me/attempts')
  async history(
    @CurrentUser() auth: AuthUser,
    @Query(new ZodValidationPipe(historyQuery)) q: z.infer<typeof historyQuery>,
  ) {
    return this.results.history(await this.user(auth), {
      limit: q.limit,
      ...(q.cursor ? { cursor: q.cursor } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    });
  }
}
