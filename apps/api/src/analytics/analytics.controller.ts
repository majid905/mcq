import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

const topicsQuery = z.object({
  parent_id: z
    .string()
    .regex(/^\d{1,19}$/)
    .optional(),
});

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
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

  @Get('overview')
  overview(@CurrentUser() auth: AuthUser) {
    return this.analytics.overview(auth.userId);
  }

  @Get('topics')
  topics(
    @CurrentUser() auth: AuthUser,
    @Query(new ZodValidationPipe(topicsQuery)) q: z.infer<typeof topicsQuery>,
  ) {
    return this.analytics.topics(auth.userId, q.parent_id ? Number(q.parent_id) : null);
  }

  @Get('progress')
  async progress(@CurrentUser() auth: AuthUser) {
    return this.analytics.progress(auth.userId, (await this.user(auth)).locale);
  }
}
