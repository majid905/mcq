import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LAYOUT_KEY = 'sitemap:questions:layout';
const LAYOUT_TTL_SEC = 3600;
const EXAM_LIMIT = 5000;

interface Layout {
  pageSize: number;
  total: number;
  /** id the page starts after: afters[n-1] is the exclusive lower bound of page n */
  afters: string[];
}

/**
 * Data for sitemap files (FR-WEB-02, NFR-PERF-05). A sitemap file may hold 50,000 URLs, so five lakh
 * questions are ten files. Page boundaries are found once an hour (a handful of indexed lookups) and
 * every page then is a plain range scan by id: no OFFSET per request, stable while questions are added.
 */
@Injectable()
export class SitemapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async layout(): Promise<Layout> {
    const cached = await this.redis.client.get(LAYOUT_KEY);
    if (cached) return JSON.parse(cached) as Layout;

    const pageSize = this.config.SITEMAP_PAGE_SIZE;
    const total = await this.prisma.questions.count({
      where: { status: 'published', slug: { not: null } },
    });
    const afters = ['0'];
    for (let n = 1; n * pageSize < total; n++) {
      // the id that closes page n (the n*pageSize-th public question)
      const row = await this.prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT id FROM questions WHERE status = 'published' AND slug IS NOT NULL
        ORDER BY id LIMIT 1 OFFSET ${n * pageSize - 1}`);
      if (!row[0]) break;
      afters.push(String(row[0].id));
    }
    const layout: Layout = { pageSize, total, afters };
    await this.redis.client.set(LAYOUT_KEY, JSON.stringify(layout), 'EX', LAYOUT_TTL_SEC);
    return layout;
  }

  async questionIndex() {
    const { pageSize, total, afters } = await this.layout();
    return {
      page_size: pageSize,
      total,
      pages: afters.map((_, i) => ({
        page: i + 1,
        count: i + 1 < afters.length ? pageSize : total - pageSize * i,
      })),
    };
  }

  async questionPage(page: number) {
    const { pageSize, afters } = await this.layout();
    const after = afters[page - 1];
    if (!Number.isInteger(page) || page < 1 || after === undefined)
      throw new ApiException('NOT_FOUND');
    const rows = await this.prisma.questions.findMany({
      where: { status: 'published', slug: { not: null }, id: { gt: BigInt(after) } },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { slug: true, updated_at: true },
    });
    return rows.map((r) => ({ slug: r.slug as string, updated_at: r.updated_at.toISOString() }));
  }

  async exams() {
    const rows = await this.prisma.exams.findMany({
      where: { status: { notIn: ['draft', 'cancelled'] } },
      orderBy: { id: 'desc' },
      take: EXAM_LIMIT,
      select: { id: true, slug: true, type: true, updated_at: true },
    });
    return rows.map((e) => ({
      id: String(e.id),
      slug: e.slug,
      type: e.type,
      updated_at: e.updated_at.toISOString(),
    }));
  }
}
