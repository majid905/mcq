import { Injectable } from '@nestjs/common';
import type { questions, taxonomy_nodes } from '@prisma/client';
import { EntitlementService } from '../exams/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaxonomyService, type TaxonomyNodeDto } from './taxonomy.service';

export type Locale = 'bn' | 'en';

export interface QuestionDto {
  id: string;
  body: string;
  options: { key: string; html: string }[];
  correct_option: string | null;
  explanation: string | null;
  answer_locked: boolean;
  difficulty: number;
  source_label: string | null;
  topic: TaxonomyNodeDto;
  is_bookmarked: boolean;
  stats: { correct_pct: number | null };
}

type QuestionRow = Pick<
  questions,
  | 'id'
  | 'body'
  | 'options'
  | 'correct_option'
  | 'explanation'
  | 'difficulty'
  | 'is_premium'
  | 'primary_node_id'
  | 'source_exam_id'
  | 'times_answered'
  | 'times_correct'
>;

export const QUESTION_SELECT = {
  id: true,
  body: true,
  options: true,
  correct_option: true,
  explanation: true,
  difficulty: true,
  is_premium: true,
  primary_node_id: true,
  source_exam_id: true,
  times_answered: true,
  times_correct: true,
} as const;

/**
 * Builds `Question` objects for a batch of rows with a fixed number of queries, and decides
 * per question whether the answer may leave the server (CLAUDE.md: never before an exam has ended).
 *
 * Locked (correct_option and explanation are null, answer_locked is true) when:
 *  - the question is in a live exam that has not ended yet, or
 *  - the question is premium and the user has no subscription for its category.
 */
@Injectable()
export class QuestionDtoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxonomy: TaxonomyService,
    private readonly entitlement: EntitlementService,
  ) {}

  async build(
    rows: QuestionRow[],
    ctx: { userId?: bigint; locale: Locale; revealAll?: boolean },
  ): Promise<QuestionDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const now = new Date();

    const nodeIds = [...new Set(rows.map((r) => r.primary_node_id))];
    const sourceIds = [...new Set(rows.flatMap((r) => r.source_exam_id ?? []))];
    const [nodes, sources, bookmarked, active] = await Promise.all([
      this.prisma.taxonomy_nodes.findMany({ where: { id: { in: nodeIds } } }),
      this.prisma.source_exams.findMany({ where: { id: { in: sourceIds } } }),
      ctx.userId
        ? this.prisma.bookmarks.findMany({
            where: { user_id: ctx.userId, question_id: { in: ids } },
            select: { question_id: true },
          })
        : Promise.resolve([]),
      // Questions that sit in a live exam which has not ended: answers stay on the server.
      this.prisma.exam_questions.findMany({
        where: {
          question_id: { in: ids },
          exams: { type: 'live', status: { in: ['scheduled', 'running'] }, end_at: { gt: now } },
        },
        select: { question_id: true },
      }),
    ]);

    const nodeById = new Map<number, taxonomy_nodes>(nodes.map((n) => [n.id, n]));
    const sourceName = new Map(
      sources.map((s) => [s.id, ctx.locale === 'en' ? s.name_en : s.name_bn]),
    );
    const bookmarkSet = new Set(bookmarked.map((b) => b.question_id));
    const inActiveExam = new Set(active.map((a) => a.question_id));

    // Subscription per category, asked once each.
    const categoryOf = (n: taxonomy_nodes | undefined) => Number(n?.path.split('/')[1] ?? 0);
    const subscribed = new Map<number, boolean>();
    if (ctx.userId) {
      for (const cat of new Set(rows.map((r) => categoryOf(nodeById.get(r.primary_node_id))))) {
        subscribed.set(cat, await this.entitlement.hasSubscription(ctx.userId, cat, now));
      }
    }
    const topicDtos = this.taxonomy.toDtos([...nodeById.values()], ctx.locale);

    return rows.map((r) => {
      const node = nodeById.get(r.primary_node_id);
      const locked =
        !ctx.revealAll &&
        (inActiveExam.has(r.id) || (r.is_premium && !subscribed.get(categoryOf(node))));
      return {
        id: String(r.id),
        body: r.body,
        options: r.options as unknown as { key: string; html: string }[],
        correct_option: locked ? null : r.correct_option,
        explanation: locked ? null : r.explanation,
        answer_locked: locked,
        difficulty: r.difficulty,
        source_label: r.source_exam_id === null ? null : (sourceName.get(r.source_exam_id) ?? null),
        topic: topicDtos.get(r.primary_node_id) as TaxonomyNodeDto,
        is_bookmarked: bookmarkSet.has(r.id),
        stats: {
          correct_pct:
            r.times_answered > 0
              ? Math.round((r.times_correct / r.times_answered) * 1000) / 10
              : null,
        },
      };
    });
  }
}
