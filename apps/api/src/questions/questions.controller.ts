import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, OptionalUser, type AuthUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ApiException } from '../common/api-exception';
import { pickLocale } from '../common/http-exception.filter';
import { parseId } from '../common/ids';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import type { Locale } from './question-dto.service';
import { QuestionsService } from './questions.service';
import { TaxonomyService } from './taxonomy.service';

const idString = z.string().regex(/^\d{1,19}$/, 'must be a numeric id');
const taxonomyQuery = z.object({ parent_id: idString.optional() });
const sourceQuery = z.object({ category_id: idString.optional() });
const listQuery = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const reportBody = z.object({
  reason: z.enum(['wrong_answer', 'typo', 'wrong_explanation', 'duplicate', 'other']),
  message: z.string().max(1000).optional(),
});

@Controller()
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly taxonomy: TaxonomyService,
    private readonly prisma: PrismaService,
  ) {}

  /** Signed-in users get their saved language; visitors get Accept-Language (Bangla by default). */
  private async locale(auth: AuthUser | undefined, header: string | undefined): Promise<Locale> {
    if (!auth) return pickLocale(header);
    const user = await this.prisma.users.findUnique({
      where: { id: auth.userId },
      select: { locale: true, status: true },
    });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return user.locale;
  }

  @Public()
  @Get('taxonomy')
  async children(
    @OptionalUser() auth: AuthUser | undefined,
    @Query(new ZodValidationPipe(taxonomyQuery)) q: z.infer<typeof taxonomyQuery>,
  ) {
    return this.taxonomy.children(q.parent_id ? Number(q.parent_id) : null, auth?.userId);
  }

  @Public()
  @Get('source-exams')
  async sourceExams(@Query(new ZodValidationPipe(sourceQuery)) q: z.infer<typeof sourceQuery>) {
    return this.questions.sourceExams(q.category_id ? Number(q.category_id) : undefined);
  }

  @Get('questions/:id')
  async get(
    @CurrentUser() auth: AuthUser,
    @Headers('accept-language') lang: string | undefined,
    @Param('id') id: string,
  ) {
    return this.questions.get(parseId(id), auth.userId, await this.locale(auth, lang));
  }

  @Public()
  @Get('public/questions/:slug')
  async bySlug(
    @OptionalUser() auth: AuthUser | undefined,
    @Headers('accept-language') lang: string | undefined,
    @Param('slug') slug: string,
  ) {
    return this.questions.bySlug(slug, auth?.userId, await this.locale(auth, lang));
  }

  @Post('questions/:id/reports')
  @HttpCode(201)
  async report(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportBody)) body: z.infer<typeof reportBody>,
  ): Promise<void> {
    await this.questions.report(auth.userId, parseId(id), body.reason, body.message);
  }

  @Get('bookmarks')
  async bookmarks(
    @CurrentUser() auth: AuthUser,
    @Headers('accept-language') lang: string | undefined,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    return this.questions.bookmarks(auth.userId, await this.locale(auth, lang), q.cursor, q.limit);
  }

  @Put('bookmarks/:id')
  @HttpCode(204)
  async addBookmark(@CurrentUser() auth: AuthUser, @Param('id') id: string): Promise<void> {
    await this.questions.bookmark(auth.userId, parseId(id), true);
  }

  @Delete('bookmarks/:id')
  @HttpCode(204)
  async removeBookmark(@CurrentUser() auth: AuthUser, @Param('id') id: string): Promise<void> {
    await this.questions.bookmark(auth.userId, parseId(id), false);
  }

  @Get('wrong-questions')
  async wrong(
    @CurrentUser() auth: AuthUser,
    @Headers('accept-language') lang: string | undefined,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    return this.questions.wrong(auth.userId, await this.locale(auth, lang), q.cursor, q.limit);
  }
}
