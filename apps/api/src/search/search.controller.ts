import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { ApiException } from '../common/api-exception';
import { Page } from '../common/page';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from './search.service';

const id = z.string().regex(/^\d{1,19}$/, 'must be a numeric id');
const query = z.object({
  q: z.string().trim().min(2).max(100),
  category_id: id.optional(),
  node_id: id.optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('questions')
  async questions(
    @CurrentUser() auth: AuthUser,
    @Query(new ZodValidationPipe(query)) q: z.infer<typeof query>,
  ) {
    const user = await this.prisma.users.findUnique({
      where: { id: auth.userId },
      select: { id: true, locale: true, status: true },
    });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    const res = await this.search.search(user, {
      q: q.q,
      ...(q.category_id ? { category_id: Number(q.category_id) } : {}),
      ...(q.node_id ? { node_id: Number(q.node_id) } : {}),
      ...(q.year ? { year: q.year } : {}),
      page: q.page,
      limit: q.limit,
    });
    // Search paginates by page number, so its meta is total/page/took_ms instead of a cursor.
    return new Page(res.hits, {
      total: res.total,
      page: q.page,
      took_ms: res.took_ms,
    });
  }
}
