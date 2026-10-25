import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type users } from '@prisma/client';
import { RateLimitService } from '../common/rate-limit.service';
import { EntitlementService } from '../exams/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUESTION_SELECT,
  QuestionDtoService,
  type QuestionDto,
} from '../questions/question-dto.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { dhakaDayOf } from '../stats/stats-logic';
import { highlightTerms, MARK_CLOSE, MARK_OPEN, markersToHtml, snippet } from './html-text';
import { MeiliClient } from './meili.client';

export interface SearchParams {
  q: string;
  category_id?: number;
  node_id?: number;
  year?: number;
  page: number;
  limit: number;
}

export interface SearchHitDto {
  question: QuestionDto;
  highlight: string;
}

export interface SearchResult {
  hits: SearchHitDto[];
  total: number;
  took_ms: number;
}

interface Found {
  ids: bigint[];
  highlights: Map<string, string>;
  total: number;
}

/**
 * FR-SRCH-01/02. Meilisearch when MEILI_URL is set (typo tolerant, fast); otherwise a plain MySQL
 * LIKE search, good enough for a small staging box but not for the full question bank.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly meili: MeiliClient,
    private readonly dtos: QuestionDtoService,
    private readonly limits: RateLimitService,
    private readonly entitlement: EntitlementService,
    private readonly settings: SettingsService,
  ) {}

  async search(user: Pick<users, 'id' | 'locale'>, p: SearchParams): Promise<SearchResult> {
    await this.limits.assert(`search:${user.id}`, 30, 60);
    const t0 = Date.now();
    const terms = p.q.split(/\s+/).filter((t) => t.length > 0);

    let found: Found;
    if (this.meili.enabled) {
      try {
        found = await this.viaMeili(p);
      } catch (err) {
        // A search outage must not take the feature down: fall back to MySQL.
        this.logger.error(`Meilisearch failed, using MySQL: ${(err as Error).message}`);
        found = await this.viaMysql(p, terms);
      }
    } else {
      found = await this.viaMysql(p, terms);
    }

    const rows = await this.prisma.questions.findMany({
      where: { id: { in: found.ids }, status: 'published' },
      select: QUESTION_SELECT,
    });
    const dtos = await this.dtos.build(rows, { userId: user.id, locale: user.locale });
    const byId = new Map(dtos.map((d) => [d.id, d]));
    const ordered = found.ids.flatMap((id) => byId.get(String(id)) ?? []);
    const hits = await this.limitAnswers(user.id, ordered);
    return {
      hits: hits.map((question) => ({
        question,
        highlight: found.highlights.get(question.id) ?? '',
      })),
      total: found.total,
      took_ms: Date.now() - t0,
    };
  }

  /**
   * FR-SRCH-02: free users may see a limited number of answers per day
   * (`free_search_answers_per_day`, counted per distinct question); the rest come back locked.
   * Subscribers see everything.
   */
  private async limitAnswers(userId: bigint, list: QuestionDto[]): Promise<QuestionDto[]> {
    if (await this.entitlement.hasAnySubscription(userId)) return list;
    const limit = await this.settings.number('free_search_answers_per_day', 10);
    const key = `quota:search:${userId}:${dhakaDayOf(new Date())}`;
    const seen = new Set(await this.redis.client.smembers(key));
    const out: QuestionDto[] = [];
    for (const q of list) {
      if (q.answer_locked) {
        out.push(q);
      } else if (seen.has(q.id) || seen.size < limit) {
        seen.add(q.id);
        await this.redis.client.sadd(key, q.id);
        out.push(q);
      } else {
        out.push({ ...q, correct_option: null, explanation: null, answer_locked: true });
      }
    }
    await this.redis.client.expire(key, 2 * 86_400);
    return out;
  }

  private async viaMeili(p: SearchParams): Promise<Found> {
    const filter = ['status = published'];
    if (p.category_id !== undefined) filter.push(`category_id = ${p.category_id}`);
    if (p.node_id !== undefined) filter.push(`node_ids = ${p.node_id}`);
    if (p.year !== undefined) filter.push(`year = ${p.year}`);
    const res = await this.meili.search({
      q: p.q,
      filter,
      limit: p.limit,
      offset: (p.page - 1) * p.limit,
      pre: MARK_OPEN,
      post: MARK_CLOSE,
    });
    const highlights = new Map<string, string>();
    for (const h of res.hits) {
      highlights.set(h.id, markersToHtml(h._formatted?.body_text ?? h.body_text ?? ''));
    }
    return {
      ids: res.hits.map((h) => BigInt(h.id)),
      highlights,
      total: res.estimatedTotalHits ?? res.totalHits ?? res.hits.length,
    };
  }

  private async viaMysql(p: SearchParams, terms: string[]): Promise<Found> {
    const used = terms.slice(0, 5);
    const conds: Prisma.Sql[] = [Prisma.sql`status = 'published'`];
    for (const t of used) {
      conds.push(Prisma.sql`body_text LIKE ${`%${t.replace(/[\\%_]/g, '\\$&')}%`}`);
    }
    if (p.year !== undefined) conds.push(Prisma.sql`source_year = ${p.year}`);
    const root = p.node_id ?? p.category_id;
    if (root !== undefined) {
      conds.push(Prisma.sql`primary_node_id IN (
        SELECT d.id FROM taxonomy_nodes c JOIN taxonomy_nodes d ON d.path LIKE CONCAT(c.path, '%')
        WHERE c.id = ${root})`);
    }
    const where = Prisma.join(conds, ' AND ');
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<{ id: bigint; body_text: string }[]>(Prisma.sql`
        SELECT id, body_text FROM questions WHERE ${where}
        ORDER BY id DESC LIMIT ${p.limit} OFFSET ${(p.page - 1) * p.limit}`),
      this.prisma.$queryRaw<{ n: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS n FROM questions WHERE ${where}`,
      ),
    ]);
    const highlights = new Map(
      rows.map((r) => [String(r.id), highlightTerms(snippet(r.body_text, used), used)]),
    );
    return { ids: rows.map((r) => r.id), highlights, total: Number(count[0]?.n ?? 0) };
  }
}
