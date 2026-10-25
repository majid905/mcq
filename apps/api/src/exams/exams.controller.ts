import { Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { examListQuerySchema, type ExamListQuery } from './exams.schemas';
import { ExamsService } from './exams.service';

@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly prisma: PrismaService,
  ) {}

  private async user(auth: AuthUser) {
    const user = await this.prisma.users.findUnique({
      where: { id: auth.userId },
      select: { id: true, locale: true, status: true },
    });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return user;
  }

  @Get()
  async list(
    @CurrentUser() auth: AuthUser,
    @Query(new ZodValidationPipe(examListQuerySchema)) query: ExamListQuery,
  ) {
    return this.exams.list(await this.user(auth), query);
  }

  @Get(':id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.exams.detail(await this.user(auth), parseId(id));
  }

  @Put(':id/reminder')
  @HttpCode(204)
  async remind(@CurrentUser() auth: AuthUser, @Param('id') id: string): Promise<void> {
    await this.exams.setReminder(auth.userId, parseId(id), true);
  }

  @Delete(':id/reminder')
  @HttpCode(204)
  async unremind(@CurrentUser() auth: AuthUser, @Param('id') id: string): Promise<void> {
    await this.exams.setReminder(auth.userId, parseId(id), false);
  }

  @Get(':id/paper')
  paper(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.exams.paperFor(auth.userId, parseId(id));
  }
}
