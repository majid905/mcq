import { Injectable } from '@nestjs/common';
import { Prisma, type questions } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPermission } from '../admin-auth.guard';
import { AuditService, type Actor } from '../audit.service';
import { prepareQuestion, type OptionInput } from './question-content';
import { TaxonomyCounts } from './taxonomy-counts';

type Status = 'draft' | 'in_review' | 'published' | 'archived';

export interface QuestionInput {
  body: string;
  options: OptionInput[];
  correct_option: OptionInput['key'];
  explanation?: string | undefined;
  difficulty?: number | undefined;
  status?: Status | undefined;
  primary_node_id: string;
  node_ids?: string[] | undefined;
  source_exam_id?: string | undefined;
  source_year?: number | undefined;
  is_premium?: boolean | undefined;
}

export interface QuestionFilter {
  q?: string | undefined;
  status?: Status | undefined;
  nodeId?: string | undefined;
  sourceExamId?: string | undefined;
  difficulty?: number | undefined;
}

export type BulkAction = 'publish' | 'archive' | 'send_to_review' | 'add_tag' | 'remove_tag';

type Row = questions & { question_tags: { node_id: number }[] };

const STATUS_FOR: Record<'publish' | 'archive' | 'send_to_review', Status> = {
  publish: 'published',
  archive: 'archived',
  send_to_review: 'in_review',
};

/** FR-ADM-04..07: the question bank as content editors see it. */
@Injectable()
export class QuestionsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly counts: TaxonomyCounts,
  ) {}

  private dto(q: Row) {
    return {
      id: String(q.id),
      body: q.body,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
      difficulty: q.difficulty,
      status: q.status,
      primary_node_id: String(q.primary_node_id),
      node_ids: q.question_tags.map((t) => String(t.node_id)).sort((a, b) => Number(a) - Number(b)),
      source_exam_id: q.source_exam_id === null ? null : String(q.source_exam_id),
      source_year: q.source_year,
      is_premium: q.is_premium,
      times_answered: q.times_answered,
      correct_pct:
        q.times_answered > 0 ? Math.round((q.times_correct / q.times_answered) * 1000) / 10 : null,
      created_by: q.created_by === null ? null : String(q.created_by),
      updated_at: q.updated_at.toISOString(),
    };
  }

  private load(id: bigint): Promise<Row | null> {
    return this.prisma.questions.findUnique({
      where: { id },
      include: { question_tags: { select: { node_id: true } } },
    });
  }

  // ------------------------------------------------------------------ read

  async list(f: QuestionFilter, cursor: string | undefined, limit: number) {
    const before = cursor ? parseId(cursor) : null;
    const text = f.q?.trim();
    const where: Prisma.questionsWhereInput = {
      ...(before ? { id: { lt: before } } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.difficulty ? { difficulty: f.difficulty } : {}),
      ...(f.sourceExamId ? { source_exam_id: Number(parseId(f.sourceExamId)) } : {}),
      ...(f.nodeId ? { question_tags: { some: { node_id: Number(parseId(f.nodeId)) } } } : {}),
      ...(text
        ? /^\d{1,19}$/.test(text)
          ? { OR: [{ id: BigInt(text) }, { body_text: { contains: text } }] }
          : { body_text: { contains: text } }
        : {}),
    };
    const rows = await this.prisma.questions.findMany({
      where,
      include: { question_tags: { select: { node_id: true } } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(
      items.map((r) => this.dto(r)),
      { next_cursor: hasMore && last ? String(last.id) : null, has_more: hasMore },
    );
  }

  async get(rawId: string) {
    const q = await this.load(parseId(rawId));
    if (!q) throw new ApiException('NOT_FOUND');
    return this.dto(q);
  }

  // ------------------------------------------------------------------ write

  private async prepare(i: QuestionInput) {
    let prepared;
    try {
      prepared = prepareQuestion(i);
    } catch (err) {
      throw new ApiException('VALIDATION_FAILED', { fields: { body: (err as Error).message } });
    }
    const primary = Number(parseId(i.primary_node_id));
    const nodeIds = [primary, ...(i.node_ids ?? []).map((n) => Number(parseId(n)))];
    const tags = await this.counts.tagsFor(nodeIds);
    if (!tags.has(primary) || tags.size < new Set(nodeIds).size) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { node_ids: 'unknown taxonomy node' },
      });
    }
    if (i.source_exam_id) {
      const src = await this.prisma.source_exams.findUnique({
        where: { id: Number(parseId(i.source_exam_id)) },
      });
      if (!src)
        throw new ApiException('VALIDATION_FAILED', { fields: { source_exam_id: 'unknown' } });
    }
    return { prepared, primary, tags };
  }

  private async nearDuplicates(primary: number, bodyText: string, exceptId: bigint) {
    const prefix = bodyText.slice(0, 40);
    if (prefix.length < 15) return [];
    const rows = await this.prisma.questions.findMany({
      where: {
        primary_node_id: primary,
        id: { not: exceptId },
        body_text: { startsWith: prefix },
      },
      select: { id: true },
      take: 5,
    });
    return rows.map((r) => String(r.id));
  }

  async create(actor: Actor, i: QuestionInput) {
    const { prepared, primary, tags } = await this.prepare(i);
    const dup = await this.prisma.questions.findUnique({ where: { content_hash: prepared.hash } });
    if (dup) throw new ApiException('DUPLICATE_QUESTION', { existing_id: String(dup.id) });

    const status = i.status ?? 'draft';
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.questions.create({
        data: {
          body: prepared.body,
          body_text: prepared.bodyText,
          options: prepared.options as unknown as Prisma.InputJsonValue,
          correct_option: i.correct_option,
          explanation: prepared.explanation,
          difficulty: i.difficulty ?? 3,
          status,
          source_exam_id: i.source_exam_id ? Number(parseId(i.source_exam_id)) : null,
          source_year: i.source_year ?? null,
          primary_node_id: primary,
          content_hash: prepared.hash,
          is_premium: i.is_premium ?? false,
          created_by: Number(actor.admin.id),
          ...(status === 'published'
            ? { published_at: new Date(), reviewed_by: Number(actor.admin.id) }
            : {}),
        },
      });
      await tx.question_tags.createMany({
        data: [...tags].map((node_id) => ({ question_id: row.id, node_id })),
      });
      if (status === 'published') {
        await tx.questions.update({ where: { id: row.id }, data: { slug: `q-${row.id}` } });
      }
      await tx.search_outbox.create({ data: { question_id: row.id, action: 'upsert' } });
      return row.id;
    });
    if (status === 'published') await this.counts.recount(tags);

    const fresh = (await this.load(id)) as Row;
    const dto = this.dto(fresh);
    await this.audit.record(actor, {
      action: 'question.create',
      entityType: 'question',
      entityId: id,
      after: dto,
    });
    return { dto, near: await this.nearDuplicates(primary, prepared.bodyText, id) };
  }

  async update(actor: Actor, rawId: string, i: QuestionInput) {
    const id = parseId(rawId);
    const before = await this.load(id);
    if (!before) throw new ApiException('NOT_FOUND');
    const { prepared, primary, tags } = await this.prepare(i);
    const clash = await this.prisma.questions.findUnique({
      where: { content_hash: prepared.hash },
    });
    if (clash && clash.id !== id) {
      throw new ApiException('DUPLICATE_QUESTION', { existing_id: String(clash.id) });
    }

    const status = i.status ?? before.status;
    const oldTags = before.question_tags.map((t) => t.node_id);
    await this.prisma.$transaction(async (tx) => {
      await tx.questions.update({
        where: { id },
        data: {
          body: prepared.body,
          body_text: prepared.bodyText,
          options: prepared.options as unknown as Prisma.InputJsonValue,
          correct_option: i.correct_option,
          explanation: prepared.explanation,
          difficulty: i.difficulty ?? before.difficulty,
          status,
          source_exam_id: i.source_exam_id ? Number(parseId(i.source_exam_id)) : null,
          source_year: i.source_year ?? null,
          primary_node_id: primary,
          content_hash: prepared.hash,
          is_premium: i.is_premium ?? before.is_premium,
          ...(status === 'published' && before.status !== 'published'
            ? {
                reviewed_by: Number(actor.admin.id),
                published_at: before.published_at ?? new Date(),
              }
            : {}),
          ...(status === 'published' && !before.slug ? { slug: `q-${id}` } : {}),
        },
      });
      await tx.question_tags.deleteMany({ where: { question_id: id } });
      await tx.question_tags.createMany({
        data: [...tags].map((node_id) => ({ question_id: id, node_id })),
      });
      await tx.search_outbox.create({ data: { question_id: id, action: 'upsert' } });
    });
    await this.counts.recount([...oldTags, ...tags]);

    const dto = this.dto((await this.load(id)) as Row);
    await this.audit.record(actor, {
      action: 'question.update',
      entityType: 'question',
      entityId: id,
      before: this.dto(before),
      after: dto,
    });
    return { dto, near: await this.nearDuplicates(primary, prepared.bodyText, id) };
  }

  /** FR-ADM-04: status moves and re-tagging for up to 1,000 questions at once. */
  async bulk(
    actor: Actor,
    ids: string[],
    action: BulkAction,
    nodeId: string | undefined,
  ): Promise<{ affected: number }> {
    const isTagAction = action === 'add_tag' || action === 'remove_tag';
    // Status moves may be done by editors (write) and moderators (review); tagging is editors only.
    const mayMoveStatus = actor.admin.permissions.some(
      (p) => p === '*' || p === 'questions.write' || p === 'questions.review',
    );
    if (isTagAction) assertPermission(actor.admin, 'questions.write');
    else if (!mayMoveStatus) assertPermission(actor.admin, 'questions.write');
    if (isTagAction && !nodeId) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { node_id: 'required for tag actions' },
      });
    }
    const qids = [...new Set(ids.map((x) => parseId(x)))];
    const touchedTags = (
      await this.prisma.question_tags.findMany({
        where: { question_id: { in: qids } },
        select: { node_id: true },
        distinct: ['node_id'],
      })
    ).map((t) => t.node_id);
    let affected: number;

    if (action === 'add_tag' || action === 'remove_tag') {
      const node = Number(parseId(nodeId as string));
      const tags = await this.counts.tagsFor([node]);
      if (!tags.has(node))
        throw new ApiException('VALIDATION_FAILED', { fields: { node_id: 'unknown' } });
      const existing = await this.prisma.questions.findMany({
        where: { id: { in: qids } },
        select: { id: true, primary_node_id: true },
      });
      affected = existing.length;
      if (action === 'add_tag') {
        await this.prisma.question_tags.createMany({
          data: existing.flatMap((q) =>
            [...tags].map((node_id) => ({ question_id: q.id, node_id })),
          ),
          skipDuplicates: true,
        });
      } else {
        // The primary topic and its ancestors are never stripped: stats and practice pools rely on them.
        const primaries = [...new Set(existing.map((q) => q.primary_node_id))];
        const protectedBy = new Map<number, Set<number>>();
        for (const p of primaries) protectedBy.set(p, await this.counts.tagsFor([p]));
        const removable = existing
          .filter((q) => !protectedBy.get(q.primary_node_id)?.has(node))
          .map((q) => q.id);
        await this.prisma.question_tags.deleteMany({
          where: { question_id: { in: removable }, node_id: node },
        });
      }
    } else {
      const status = STATUS_FOR[action];
      const now = new Date();
      const res = await this.prisma.questions.updateMany({
        where: { id: { in: qids } },
        data: { status },
      });
      affected = res.count;
      if (status === 'published') {
        await this.prisma.questions.updateMany({
          where: { id: { in: qids }, published_at: null },
          data: { published_at: now, reviewed_by: Number(actor.admin.id) },
        });
        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE questions SET slug = CONCAT('q-', id) WHERE id IN (${Prisma.join(qids)}) AND slug IS NULL`,
        );
      }
    }
    await this.prisma.search_outbox.createMany({
      data: qids.map((question_id) => ({ question_id, action: 'upsert' as const })),
    });
    await this.counts.recount(
      action === 'add_tag' || action === 'remove_tag'
        ? [...touchedTags, ...(await this.counts.tagsFor([Number(parseId(nodeId as string))]))]
        : touchedTags,
    );
    await this.audit.record(actor, {
      action: `question.bulk_${action}`,
      entityType: 'question',
      entityId: `bulk:${qids.length}`,
      after: { ids: qids.slice(0, 50).map(String), count: qids.length, node_id: nodeId ?? null },
    });
    return { affected };
  }
}
