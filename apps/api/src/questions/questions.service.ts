import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { Page } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitService } from '../common/rate-limit.service';
import { QUESTION_SELECT, QuestionDtoService, type Locale } from './question-dto.service';

const PUBLISHED = { status: 'published' as const };

/** `<time ms>_<question id>`: newest first, stable when several rows share a timestamp. */
function parseCursor(raw: string | undefined): { at: Date; id: bigint } | null {
  if (!raw) return null;
  const m = /^(\d{1,15})_(\d{1,19})$/.exec(raw);
  if (!m?.[1] || !m[2]) {
    throw new ApiException('VALIDATION_FAILED', { fields: { cursor: 'invalid cursor' } });
  }
  return { at: new Date(Number(m[1])), id: BigInt(m[2]) };
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dtos: QuestionDtoService,
    private readonly limits: RateLimitService,
  ) {}

  async get(id: bigint, userId: bigint, locale: Locale) {
    const row = await this.prisma.questions.findFirst({
      where: { id, ...PUBLISHED },
      select: QUESTION_SELECT,
    });
    if (!row) throw new ApiException('NOT_FOUND');
    return (await this.dtos.build([row], { userId, locale }))[0];
  }

  /** FR-WEB-02: public SEO page data. Same answer locking, no user. */
  async bySlug(slug: string, userId: bigint | undefined, locale: Locale) {
    if (!/^[\p{L}\p{N}_-]{1,200}$/u.test(slug)) throw new ApiException('NOT_FOUND');
    const row = await this.prisma.questions.findFirst({
      where: { slug, ...PUBLISHED },
      select: QUESTION_SELECT,
    });
    if (!row) throw new ApiException('NOT_FOUND');
    return (await this.dtos.build([row], { ...(userId ? { userId } : {}), locale }))[0];
  }

  // ------------------------------------------------------------------ bookmarks

  async bookmark(userId: bigint, questionId: bigint, on: boolean): Promise<void> {
    if (on) {
      const exists = await this.prisma.questions.count({ where: { id: questionId, ...PUBLISHED } });
      if (!exists) throw new ApiException('NOT_FOUND');
      await this.prisma.bookmarks.createMany({
        data: [{ user_id: userId, question_id: questionId }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.bookmarks.deleteMany({
        where: { user_id: userId, question_id: questionId },
      });
    }
  }

  async bookmarks(userId: bigint, locale: Locale, cursor: string | undefined, limit: number) {
    const c = parseCursor(cursor);
    const rows = await this.prisma.bookmarks.findMany({
      where: {
        user_id: userId,
        ...(c
          ? {
              OR: [{ created_at: { lt: c.at } }, { created_at: c.at, question_id: { lt: c.id } }],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { question_id: 'desc' }],
      take: limit + 1,
    });
    return this.page(
      rows.map((r) => ({ at: r.created_at, id: r.question_id })),
      limit,
      userId,
      locale,
    );
  }

  // ------------------------------------------------------------------ wrong questions

  /** FR-PRAC-05: newest mistakes first. Rows leave the list after two correct answers in a row. */
  async wrong(userId: bigint, locale: Locale, cursor: string | undefined, limit: number) {
    const c = parseCursor(cursor);
    const rows = await this.prisma.user_wrong_questions.findMany({
      where: {
        user_id: userId,
        ...(c
          ? {
              OR: [
                { last_wrong_at: { lt: c.at } },
                { last_wrong_at: c.at, question_id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ last_wrong_at: 'desc' }, { question_id: 'desc' }],
      take: limit + 1,
    });
    return this.page(
      rows.map((r) => ({ at: r.last_wrong_at, id: r.question_id })),
      limit,
      userId,
      locale,
    );
  }

  private async page(
    keys: { at: Date; id: bigint }[],
    limit: number,
    userId: bigint,
    locale: Locale,
  ) {
    const hasMore = keys.length > limit;
    const slice = hasMore ? keys.slice(0, limit) : keys;
    const rows = await this.prisma.questions.findMany({
      where: { id: { in: slice.map((k) => k.id) }, ...PUBLISHED },
      select: QUESTION_SELECT,
    });
    const dtos = await this.dtos.build(rows, { userId, locale });
    const byId = new Map(dtos.map((d) => [d.id, d]));
    const items = slice.flatMap((k) => byId.get(String(k.id)) ?? []);
    const last = slice[slice.length - 1];
    return new Page(items, {
      next_cursor: hasMore && last ? `${last.at.getTime()}_${last.id}` : null,
      has_more: hasMore,
    });
  }

  // ------------------------------------------------------------------ reports

  /** FR-REP-01. One report per user, question and reason; 10 reports per user per hour. */
  async report(
    userId: bigint,
    questionId: bigint,
    reason: 'wrong_answer' | 'typo' | 'wrong_explanation' | 'duplicate' | 'other',
    message: string | undefined,
  ): Promise<void> {
    await this.limits.assert(`report:${userId}`, 10, 3600);
    const exists = await this.prisma.questions.count({ where: { id: questionId } });
    if (!exists) throw new ApiException('NOT_FOUND');
    const made = await this.prisma.question_reports.createMany({
      data: [
        {
          question_id: questionId,
          user_id: userId,
          reason,
          message: message?.trim() ? message.trim() : null,
        },
      ],
      skipDuplicates: true,
    });
    if (made.count === 0) throw new ApiException('ALREADY_REPORTED');
  }

  // ------------------------------------------------------------------ source exams

  /** FR-PRAC-04: previous-year papers, with how many questions each has. */
  async sourceExams(categoryId: number | undefined) {
    const rows = await this.prisma.source_exams.findMany({
      where: categoryId ? { category_id: categoryId } : {},
      orderBy: [{ year: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [counts, papers] = await Promise.all([
      this.prisma.questions.groupBy({
        by: ['source_exam_id'],
        where: { source_exam_id: { in: ids }, ...PUBLISHED },
        _count: { _all: true },
      }),
      this.prisma.exams.findMany({
        where: {
          source_exam_id: { in: ids },
          type: 'previous_year',
          status: { in: ['scheduled', 'running', 'ended', 'merit_published'] },
        },
        select: { id: true, source_exam_id: true },
        orderBy: { id: 'desc' },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.source_exam_id, c._count._all]));
    const paperBy = new Map<number, bigint>();
    for (const p of papers) if (p.source_exam_id !== null) paperBy.set(p.source_exam_id, p.id);
    return rows.map((r) => ({
      id: String(r.id),
      name_bn: r.name_bn,
      name_en: r.name_en,
      slug: r.slug,
      year: r.year,
      question_count: countBy.get(r.id) ?? 0,
      paper_exam_id: paperBy.has(r.id) ? String(paperBy.get(r.id)) : null,
    }));
  }
}
