import { Body, Controller, Headers, HttpCode, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ExamsService } from '../exams/exams.service';
import { startBodySchema, type StartBody } from '../exams/exams.schemas';
import { PrismaService } from '../prisma/prisma.service';
import { answerSyncSchema, type AnswerSyncDto } from './attempts.schemas';
import { AttemptsService } from './attempts.service';

@Controller()
export class AttemptsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly exams: ExamsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('exams/:id/start')
  async start(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Headers('x-platform') platform: string | undefined,
    @Body(new ZodValidationPipe(startBodySchema)) body: StartBody,
  ) {
    const user = await this.prisma.users.findUnique({
      where: { id: auth.userId },
      select: { id: true, district_id: true, status: true },
    });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
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
}
