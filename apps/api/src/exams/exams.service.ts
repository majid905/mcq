import { Injectable } from '@nestjs/common';
import type { Prisma, exams, users } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { Page } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveStatus, type ExamCardDto } from './exam-card';
import { ExamCardsService } from './exam-cards.service';
import { EntitlementService, type LockedReason } from './entitlement.service';
import type { ExamListQuery } from './exams.schemas';
import { PaperService, type PaperDto } from './paper.service';

export interface ExamDetailDto extends ExamCardDto {
  description: string | null;
  mark_per_question: number;
  negative_mark: number;
  pass_marks: number | null;
  result_publish_at: string | null;
  syllabus: { node_id: string; label: string; questions: number; marks: number }[];
  rules: string[];
  locked_reason: LockedReason | null;
}

const HIDDEN: exams['status'][] = ['draft', 'cancelled'];
const OPEN: exams['status'][] = ['scheduled', 'running'];

interface SyllabusRow {
  node_id: number | string;
  label: string;
  questions: number;
  marks: number;
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: ExamCardsService,
    private readonly entitlement: EntitlementService,
    private readonly papers: PaperService,
  ) {}

  /** FR-EXAM-01. Keyset pagination; upcoming sorts by start time, the rest newest first. */
  async list(user: Pick<users, 'id' | 'locale'>, q: ExamListQuery): Promise<Page<ExamCardDto>> {
    const now = new Date();
    const filter: Prisma.examsWhereInput[] = [];
    if (q.type) filter.push({ type: q.type });
    if (q.category_id) filter.push({ category_id: Number(q.category_id) });

    let statusWhere: Prisma.examsWhereInput;
    let orderBy: Prisma.examsOrderByWithRelationInput[];
    if (q.status === 'upcoming') {
      statusWhere = { status: { in: OPEN }, start_at: { gt: now } };
      orderBy = [{ start_at: 'asc' }, { id: 'asc' }];
      const c = this.parseUpcomingCursor(q.cursor);
      if (c) {
        filter.push({
          OR: [{ start_at: { gt: c.startAt } }, { start_at: c.startAt, id: { gt: c.id } }],
        });
      }
    } else {
      statusWhere =
        q.status === 'running'
          ? {
              status: { in: OPEN },
              OR: [{ start_at: null }, { start_at: { lte: now }, end_at: { gt: now } }],
            }
          : {
              OR: [
                { status: { in: ['ended', 'merit_published'] } },
                { status: { in: OPEN }, end_at: { lte: now } },
              ],
            };
      orderBy = [{ id: 'desc' }];
      if (q.cursor) {
        if (!/^\d{1,19}$/.test(q.cursor)) {
          throw new ApiException('VALIDATION_FAILED', { fields: { cursor: 'invalid cursor' } });
        }
        filter.push({ id: { lt: BigInt(q.cursor) } });
      }
    }

    const rows = await this.prisma.exams.findMany({
      where: { AND: [{ status: { notIn: HIDDEN } }, statusWhere, ...filter] },
      orderBy,
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const pageRows = hasMore ? rows.slice(0, q.limit) : rows;
    const built = await this.cards.build(user, pageRows, now);
    const items = pageRows.flatMap((e) => built.get(e.id) ?? []);
    const last = pageRows[pageRows.length - 1];
    const next =
      hasMore && last
        ? q.status === 'upcoming'
          ? `${last.start_at?.getTime() ?? 0}_${last.id}`
          : String(last.id)
        : null;
    return new Page(items, { next_cursor: next, has_more: hasMore });
  }

  async detail(user: Pick<users, 'id' | 'locale'>, examId: bigint): Promise<ExamDetailDto> {
    const now = new Date();
    const exam = await this.visible(examId);
    const card = (await this.cards.build(user, [exam], now)).get(exam.id);
    if (!card) throw new ApiException('NOT_FOUND');

    let locked: LockedReason | null = null;
    if (!card.my_attempt) {
      const decision = await this.entitlement.decide(user.id, exam, now);
      locked = decision.locked;
      // Practice mode after the exam is not metered by the monthly live quota.
      if (card.status === 'finished' && locked === 'quota_exhausted') locked = null;
    }

    const en = user.locale === 'en';
    const syllabus = (
      Array.isArray(exam.syllabus) ? (exam.syllabus as unknown as SyllabusRow[]) : []
    ).map((s) => ({
      node_id: String(s.node_id),
      label: s.label,
      questions: Number(s.questions),
      marks: Number(s.marks),
    }));
    return {
      ...card,
      description: exam.description,
      mark_per_question: Number(exam.mark_per_question),
      negative_mark: Number(exam.negative_mark),
      pass_marks: exam.pass_marks === null ? null : Number(exam.pass_marks),
      result_publish_at: exam.result_publish_at?.toISOString() ?? null,
      syllabus,
      rules: rulesFor(exam, en),
      locked_reason: locked,
    };
  }

  async setReminder(userId: bigint, examId: bigint, on: boolean): Promise<void> {
    await this.visible(examId);
    if (on) {
      await this.prisma.exam_reminders.createMany({
        data: [{ user_id: userId, exam_id: examId }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.exam_reminders.deleteMany({ where: { user_id: userId, exam_id: examId } });
    }
  }

  /**
   * Fallback for the CDN copy. Only users who have started the exam get it, so a premium paper
   * cannot be read without passing the checks in `POST /exams/{id}/start`.
   */
  async paperFor(userId: bigint, examId: bigint): Promise<PaperDto> {
    const exam = await this.visible(examId);
    const status = effectiveStatus(exam, new Date());
    if (status === 'upcoming' || status === 'open_soon') throw new ApiException('EXAM_NOT_STARTED');
    const attempt = await this.prisma.attempts.findFirst({
      where: { user_id: userId, exam_id: examId },
      select: { id: true },
    });
    if (!attempt) throw new ApiException('FORBIDDEN');
    return this.papers.getPaper(examId);
  }

  async visible(examId: bigint): Promise<exams> {
    const exam = await this.prisma.exams.findUnique({ where: { id: examId } });
    if (!exam || HIDDEN.includes(exam.status)) throw new ApiException('NOT_FOUND');
    return exam;
  }

  private parseUpcomingCursor(raw: string | undefined): { startAt: Date; id: bigint } | null {
    if (!raw) return null;
    const m = /^(\d{1,15})_(\d{1,19})$/.exec(raw);
    if (!m?.[1] || !m[2]) {
      throw new ApiException('VALIDATION_FAILED', { fields: { cursor: 'invalid cursor' } });
    }
    return { startAt: new Date(Number(m[1])), id: BigInt(m[2]) };
  }
}

function rulesFor(exam: exams, en: boolean): string[] {
  const mark = Number(exam.mark_per_question);
  const neg = Number(exam.negative_mark);
  const rules = en
    ? [
        neg > 0
          ? `Each question carries ${mark} mark. ${neg} is deducted for a wrong answer.`
          : `Each question carries ${mark} mark. There is no negative marking.`,
        'Do not switch apps or tabs after the exam starts.',
        'Your answers are submitted automatically when time runs out.',
      ]
    : [
        neg > 0
          ? `প্রতিটি প্রশ্নের মান ${mark}। ভুল উত্তরের জন্য ${neg} নম্বর কাটা যাবে।`
          : `প্রতিটি প্রশ্নের মান ${mark}। ভুল উত্তরে নম্বর কাটা যাবে না।`,
        'পরীক্ষা শুরুর পর অ্যাপ বা ট্যাব পরিবর্তন করা যাবে না।',
        'সময় শেষ হলে উত্তর স্বয়ংক্রিয়ভাবে জমা হবে।',
      ];
  return rules;
}
