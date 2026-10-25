import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationService } from './notification.service';

const listQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const readBody = z.object({
  ids: z
    .array(z.string().regex(/^\d{1,19}$/))
    .max(200)
    .optional(),
  all: z.boolean().optional(),
});
const prefsBody = z.object({
  exam_reminder: z.boolean().optional(),
  result: z.boolean().optional(),
  subscription: z.boolean().optional(),
  promotional: z.boolean().optional(),
});

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentUser() auth: AuthUser,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    return this.notifications.list(auth.userId, q.cursor, q.limit);
  }

  @Post('read')
  @HttpCode(204)
  async read(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(readBody)) body: z.infer<typeof readBody>,
  ): Promise<void> {
    await this.notifications.markRead(auth.userId, body.ids, body.all);
  }

  @Get('preferences')
  prefs(@CurrentUser() auth: AuthUser) {
    return this.notifications.prefs(auth.userId);
  }

  @Put('preferences')
  setPrefs(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(prefsBody)) body: z.infer<typeof prefsBody>,
  ) {
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as z.infer<typeof prefsBody>;
    return this.notifications.setPrefs(auth.userId, patch);
  }
}
