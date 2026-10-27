import { Injectable } from '@nestjs/common';
import { Prisma, type exams } from '@prisma/client';
import { SUBMIT_STREAM } from '../../attempts/attempt-state';
import { SCORING_GROUP } from '../../attempts/scoring.service';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { ulid } from '../../billing/ulid';
import { answerKeyKey, PaperService, paperKey } from '../../exams/paper.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditService, type Actor } from '../audit.service';
import { BAND_RANGE, shuffle, splitByMix, type Rule } from './blueprint';

export interface ExamInput {
  type: 'live' | 'model' | 'previous_year';
  category_id: string;
  title_bn: string;
  title_en: string;
  description?: string | undefined;
  start_at?: string | null | undefined;
  end_at?: string | null | undefined;
  duration_sec: number;
  question_count: number;
  mark_per_question: number;
  negative_mark: number;
  pass_marks?: number | undefined;
  is_premium?: boolean | undefined;
  shuffle_questions?: boolean | undefined;
  shuffle_options?: boolean | undefined;
  result_publish_at?: string | undefined;
  source_exam_id?: string | undefined;
  blueprint?: { rules?: Rule[]; exclude_used_in_last_exams?: number } | undefined;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
const money = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const SCORING_FIELDS = ['question_count', 'mark_per_question', 'negative_mark'] as const;

/** FR-ADM-10 / FR-ADM-11: exam builder, paper generator, publish and live monitor. */
@Injectable()
export class ExamsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly papers: PaperService,
    private readonly settings: SettingsService,
  ) {}

  private async dto(e: exams) {
    const paperQuestions = await this.prisma.exam_questions.count({ where: { exam_id: e.id } });
    return {
      id: String(e.id),
      type: e.type,
      category_id: String(e.category_id),
      title_bn: e.title_bn,
      title_en: e.title_en,
      slug: e.slug,
      description: e.description,
      start_at: iso(e.start_at),
      end_at: iso(e.end_at),
      duration_sec: e.duration_sec,
      question_count: e.question_count,
      mark_per_question: Number(e.mark_per_question),
      negative_mark: Number(e.negative_mark),
      total_marks: Number(e.total_marks),
      pass_marks: e.pass_marks === null ? null : Number(e.pass_marks),
      is_premium: e.is_premium,
      shuffle_questions: e.shuffle_questions,
      shuffle_options: e.shuffle_options,
      result_publish_at: iso(e.result_publish_at),
      source_exam_id: e.source_exam_id === null ? null : String(e.source_exam_id),
      blueprint: e.blueprint,
      status: e.status,
      paper_questions: paperQuestions,
      participant_count: e.participant_count,
      created_at: e.created_at.toISOString(),
    };
  }

  private async load(rawId: string): Promise<exams> {
    const e = await this.prisma.exams.findUnique({ where: { id: parseId(rawId) } });
    if (!e) throw new ApiException('NOT_FOUND');
    return e;
  }

  async list(cursor: string | undefined, limit: number) {
    const before = cursor ? parseId(cursor) : null;
    const rows = await this.prisma.exams.findMany({
      where: before ? { id: { lt: before } } : {},
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(await Promise.all(items.map((e) => this.dto(e))), {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    });
  }

  async get(rawId: string) {
    return this.dto(await this.load(rawId));
  }

  // ------------------------------------------------------------------ create / update

  private async data(i: ExamInput) {
    const start = i.start_at ? new Date(i.start_at) : null;
    const end = i.end_at ? new Date(i.end_at) : null;
    if (start && end && end <= start) {
      throw new ApiException('VALIDATION_FAILED', { fields: { end_at: 'must be after start_at' } });
    }
    if (i.type === 'live' && (!start || !end) && (i.start_at || i.end_at)) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { end_at: 'live exams need both times' },
      });
    }
    const category = await this.prisma.taxonomy_nodes.findUnique({
      where: { id: Number(parseId(i.category_id)) },
    });
    if (!category || category.type !== 'category') {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { category_id: 'must be a category' },
      });
    }
    if (i.source_exam_id) {
      const src = await this.prisma.source_exams.findUnique({
        where: { id: Number(parseId(i.source_exam_id)) },
      });
      if (!src)
        throw new ApiException('VALIDATION_FAILED', { fields: { source_exam_id: 'unknown' } });
    }
    return {
      type: i.type,
      category_id: category.id,
      title_bn: i.title_bn,
      title_en: i.title_en,
      description: i.description ?? null,
      start_at: start,
      end_at: end,
      duration_sec: i.duration_sec,
      question_count: i.question_count,
      mark_per_question: i.mark_per_question,
      negative_mark: i.negative_mark,
      total_marks: money(i.question_count * i.mark_per_question),
      pass_marks: i.pass_marks ?? null,
      is_premium: i.is_premium ?? true,
      shuffle_questions: i.shuffle_questions ?? true,
      shuffle_options: i.shuffle_options ?? true,
      result_publish_at: i.result_publish_at ? new Date(i.result_publish_at) : null,
      source_exam_id: i.source_exam_id ? Number(parseId(i.source_exam_id)) : null,
      blueprint: (i.blueprint ?? Prisma.DbNull) as Prisma.InputJsonValue,
    };
  }

  async create(actor: Actor, i: ExamInput) {
    const data = await this.data(i);
    const row = await this.prisma.$transaction(async (tx) => {
      const made = await tx.exams.create({
        data: { ...data, slug: `tmp-${ulid()}`, created_by: Number(actor.admin.id) },
      });
      return tx.exams.update({
        where: { id: made.id },
        data: { slug: `${slugify(i.title_en) || 'exam'}-${made.id}` },
      });
    });
    const dto = await this.dto(row);
    await this.audit.record(actor, {
      action: 'exam.create',
      entityType: 'exam',
      entityId: row.id,
      after: dto,
    });
    return dto;
  }

  async update(actor: Actor, rawId: string, i: ExamInput) {
    const before = await this.load(rawId);
    const data = await this.data(i);
    if (before.status !== 'draft') {
      const unstarted =
        before.status === 'scheduled' && (before.start_at === null || before.start_at > new Date());
      if (!unstarted) {
        // Running, finished or cancelled: only the texts and the pass mark may change.
        const row = await this.prisma.exams.update({
          where: { id: before.id },
          data: {
            title_bn: data.title_bn,
            title_en: data.title_en,
            description: data.description,
            pass_marks: data.pass_marks,
          },
        });
        return this.finishUpdate(actor, before, row);
      }
      // Scheduled but not started: the paper and scoring rules are frozen until unpublished.
      const scoringChanged = SCORING_FIELDS.some((f) => Number(before[f]) !== Number(data[f]));
      if (scoringChanged || data.type !== before.type) {
        throw new ApiException('IN_USE', {
          reason: 'unpublish the exam before changing its type, marks or question count',
        });
      }
    }
    const row = await this.prisma.exams.update({ where: { id: before.id }, data });
    return this.finishUpdate(actor, before, row);
  }

  private async finishUpdate(actor: Actor, before: exams, row: exams) {
    const dto = await this.dto(row);
    await this.audit.record(actor, {
      action: 'exam.update',
      entityType: 'exam',
      entityId: row.id,
      before: await this.dto(before),
      after: dto,
    });
    return dto;
  }

  // ------------------------------------------------------------------ paper

  async paper(rawId: string) {
    const e = await this.load(rawId);
    const rows = await this.prisma.exam_questions.findMany({
      where: { exam_id: e.id },
      orderBy: { position: 'asc' },
    });
    const qs = await this.prisma.questions.findMany({
      where: { id: { in: rows.map((r) => r.question_id) } },
      select: { id: true, body_text: true, status: true },
    });
    const byId = new Map(qs.map((q) => [q.id, q]));
    return rows.map((r) => ({
      position: r.position,
      question_id: String(r.question_id),
      section_node_id: r.section_node_id === null ? null : String(r.section_node_id),
      body_text: (byId.get(r.question_id)?.body_text ?? '').slice(0, 300),
      status: byId.get(r.question_id)?.status ?? 'archived',
    }));
  }

  private async dropPaperCache(examId: bigint) {
    await this.redis.client.del(paperKey(examId), answerKeyKey(examId));
  }

  /** Subject-level tag of each question, used as its section in the paper. */
  private async sectionsOf(qids: bigint[]): Promise<Map<bigint, number>> {
    const rows = await this.prisma.$queryRaw<{ question_id: bigint; node_id: number }[]>(Prisma.sql`
      SELECT qt.question_id, MIN(n.id) AS node_id
      FROM question_tags qt JOIN taxonomy_nodes n ON n.id = qt.node_id AND n.type = 'subject'
      WHERE qt.question_id IN (${Prisma.join(qids)})
      GROUP BY qt.question_id`);
    return new Map(rows.map((r) => [BigInt(r.question_id), Number(r.node_id)]));
  }

  async setPaper(actor: Actor, rawId: string, rawIds: string[]) {
    const exam = await this.load(rawId);
    if (exam.status !== 'draft') {
      throw new ApiException('IN_USE', { reason: 'unpublish the exam before changing its paper' });
    }
    const ids = rawIds.map((x) => parseId(x));
    if (new Set(ids).size !== ids.length) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { question_ids: 'duplicate question' },
      });
    }
    if (ids.length > exam.question_count) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { question_ids: `at most ${exam.question_count} questions` },
      });
    }
    if (ids.length > 0) {
      const found = await this.prisma.questions.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      });
      const bad = ids.filter((id) => found.find((f) => f.id === id)?.status !== 'published');
      if (bad.length > 0) {
        throw new ApiException('VALIDATION_FAILED', {
          fields: { question_ids: `not published: ${bad.slice(0, 5).join(', ')}` },
        });
      }
    }
    const sections = ids.length > 0 ? await this.sectionsOf(ids) : new Map<bigint, number>();
    await this.prisma.$transaction(async (tx) => {
      await tx.exam_questions.deleteMany({ where: { exam_id: exam.id } });
      if (ids.length > 0) {
        await tx.exam_questions.createMany({
          data: ids.map((question_id, idx) => ({
            exam_id: exam.id,
            question_id,
            position: idx + 1,
            section_node_id: sections.get(question_id) ?? null,
          })),
        });
      }
      await tx.exams.update({ where: { id: exam.id }, data: { paper_version: { increment: 1 } } });
    });
    await this.dropPaperCache(exam.id);
    await this.audit.record(actor, {
      action: 'exam.set_paper',
      entityType: 'exam',
      entityId: exam.id,
      after: { count: ids.length, question_ids: rawIds.slice(0, 200) },
    });
  }

  /**
   * Proposes a paper from the saved blueprint (nothing is written). For each rule: split the count by
   * difficulty mix, then sample published questions of that topic that were not in the last N exams of
   * the same category. Sampling starts at a random id and wraps, so it is an index range scan, never
   * `ORDER BY RAND()` over the bank.
   */
  async generate(rawId: string) {
    const exam = await this.load(rawId);
    const bp = exam.blueprint as { rules?: Rule[]; exclude_used_in_last_exams?: number } | null;
    const rules = bp?.rules ?? [];
    if (rules.length === 0) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { blueprint: 'add at least one rule' },
      });
    }
    const lastN = Math.max(0, Math.min(bp?.exclude_used_in_last_exams ?? 10, 100));
    const recent = lastN
      ? await this.prisma.exams.findMany({
          where: { category_id: exam.category_id, id: { not: exam.id }, status: { not: 'draft' } },
          orderBy: { id: 'desc' },
          take: lastN,
          select: { id: true },
        })
      : [];
    const used = new Set<bigint>(
      recent.length
        ? (
            await this.prisma.exam_questions.findMany({
              where: { exam_id: { in: recent.map((r) => r.id) } },
              select: { question_id: true },
            })
          ).map((r) => r.question_id)
        : [],
    );

    const chosen: bigint[] = [];
    const taken = new Set<bigint>();
    const shortfalls: { node_id: string; needed: number; available: number }[] = [];

    for (const rule of rules) {
      const nodeId = Number(parseId(rule.node_id));
      let needed = 0;
      let got = 0;
      for (const part of splitByMix(rule.count, rule.difficulty_mix)) {
        needed += part.n;
        const [lo, hi] = part.band === 'any' ? [1, 5] : BAND_RANGE[part.band];
        const picked = await this.sample(nodeId, lo, hi, part.n, used, taken);
        for (const id of picked) {
          taken.add(id);
          chosen.push(id);
        }
        got += picked.length;
      }
      if (got < needed) {
        shortfalls.push({ node_id: rule.node_id, needed, available: got });
      }
    }
    return { question_ids: chosen.map(String), shortfalls };
  }

  private async sample(
    nodeId: number,
    lo: number,
    hi: number,
    need: number,
    used: Set<bigint>,
    taken: Set<bigint>,
  ): Promise<bigint[]> {
    const range = await this.prisma.$queryRaw<
      { lo: bigint | null; hi: bigint | null }[]
    >(Prisma.sql`
      SELECT MIN(q.id) AS lo, MAX(q.id) AS hi
      FROM question_tags qt JOIN questions q ON q.id = qt.question_id
      WHERE qt.node_id = ${nodeId} AND q.status = 'published' AND q.difficulty BETWEEN ${lo} AND ${hi}`);
    const min = range[0]?.lo,
      max = range[0]?.hi;
    if (min === null || min === undefined || max === null || max === undefined) return [];
    const start =
      BigInt(min) + BigInt(Math.floor(Math.random() * Number(BigInt(max) - BigInt(min) + 1n)));
    const batch = Math.max(500, need * 6 + used.size);
    const fetch = (after: boolean) =>
      this.prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        SELECT q.id FROM question_tags qt JOIN questions q ON q.id = qt.question_id
        WHERE qt.node_id = ${nodeId} AND q.status = 'published' AND q.difficulty BETWEEN ${lo} AND ${hi}
          AND ${after ? Prisma.sql`q.id >= ${start}` : Prisma.sql`q.id < ${start}`}
        ORDER BY q.id LIMIT ${batch}`);
    const ok = (id: bigint) => !used.has(id) && !taken.has(id);
    let pool = (await fetch(true)).map((r) => BigInt(r.id)).filter(ok);
    if (pool.length < need) {
      pool = pool.concat((await fetch(false)).map((r) => BigInt(r.id)).filter(ok));
    }
    return shuffle(pool).slice(0, need);
  }

  // ------------------------------------------------------------------ publish

  /** Everything that would make the exam fail on the day is found here, not at start time. */
  async publish(actor: Actor, rawId: string) {
    const exam = await this.load(rawId);
    if (exam.status !== 'draft') {
      throw new ApiException('EXAM_NOT_PUBLISHABLE', { problems: [`status is ${exam.status}`] });
    }
    const problems: string[] = [];
    const now = new Date();
    if (exam.type === 'live') {
      if (!exam.start_at || !exam.end_at) problems.push('live exam needs start_at and end_at');
      else {
        if (exam.start_at <= now) problems.push('start_at is in the past');
        if (exam.end_at.getTime() - exam.start_at.getTime() < exam.duration_sec * 1000) {
          problems.push('the exam window is shorter than the duration');
        }
      }
    }
    const rows = await this.prisma.exam_questions.findMany({
      where: { exam_id: exam.id },
      select: { question_id: true, section_node_id: true },
    });
    if (rows.length !== exam.question_count) {
      problems.push(`paper has ${rows.length} questions, exam needs ${exam.question_count}`);
    }
    if (rows.length > 0) {
      const notLive = await this.prisma.questions.count({
        where: { id: { in: rows.map((r) => r.question_id) }, NOT: { status: 'published' } },
      });
      if (notLive > 0) problems.push(`${notLive} question(s) are no longer published`);
    }
    if (problems.length > 0) throw new ApiException('EXAM_NOT_PUBLISHABLE', { problems });

    // Dry-run the real paper build so a broken paper fails here, not 30 minutes before the start.
    await this.dropPaperCache(exam.id);
    await this.papers.build(exam.id);

    const nodes = await this.prisma.taxonomy_nodes.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => r.section_node_id ?? []))] } },
      select: { id: true, name_bn: true },
    });
    const syllabus = nodes.map((n) => {
      const count = rows.filter((r) => r.section_node_id === n.id).length;
      return {
        node_id: n.id,
        label: n.name_bn,
        questions: count,
        marks: money(count * Number(exam.mark_per_question)),
      };
    });
    const delay = await this.settings.number('merit_publish_delay_sec', 300);
    const row = await this.prisma.exams.update({
      where: { id: exam.id },
      data: {
        status: 'scheduled',
        syllabus,
        result_publish_at:
          exam.result_publish_at ??
          (exam.end_at ? new Date(exam.end_at.getTime() + delay * 1000) : null),
      },
    });
    const dto = await this.dto(row);
    await this.audit.record(actor, {
      action: 'exam.publish',
      entityType: 'exam',
      entityId: exam.id,
      before: { status: 'draft' },
      after: { status: 'scheduled', start_at: dto.start_at },
    });
    return dto;
  }

  async unpublish(actor: Actor, rawId: string) {
    const exam = await this.load(rawId);
    const started = exam.start_at !== null && exam.start_at <= new Date();
    const attempts = await this.prisma.attempts.count({ where: { exam_id: exam.id } });
    if (exam.status !== 'scheduled' || started || attempts > 0) {
      throw new ApiException('IN_USE', {
        reason: 'only a scheduled exam that nobody has started can go back to draft',
        attempts,
      });
    }
    await this.dropPaperCache(exam.id);
    const row = await this.prisma.exams.update({
      where: { id: exam.id },
      data: { status: 'draft' },
    });
    await this.audit.record(actor, {
      action: 'exam.unpublish',
      entityType: 'exam',
      entityId: exam.id,
      before: { status: 'scheduled' },
      after: { status: 'draft' },
    });
    return this.dto(row);
  }

  // ------------------------------------------------------------------ monitor

  /** Live numbers. Counts come from MySQL (indexed by exam) plus the Redis start counter, which runs ahead of MySQL. */
  async monitor(rawId: string) {
    const exam = await this.load(rawId);
    const [groups, redisJoined, backlog] = await Promise.all([
      this.prisma.attempts.groupBy({
        by: ['status'],
        where: { exam_id: exam.id, kind: 'live' },
        _count: { _all: true },
      }),
      this.redis.client.get(`exam:${exam.id}:participants`),
      this.queueBacklog(),
    ]);
    const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    const total = groups.reduce((s, g) => s + g._count._all, 0);
    return {
      joined: Math.max(total, exam.participant_count),
      active_now: n('in_progress'),
      submitted: n('submitted') + n('scored') + n('expired'),
      scored: n('scored'),
      queue_backlog: backlog,
      // Failures are logged by the scoring consumer; there is no per-exam counter yet.
      error_rate_pct: 0,
      ...(redisJoined
        ? { joined: Math.max(total, exam.participant_count, Number(redisJoined)) }
        : {}),
    };
  }

  /** Messages the scoring group has not finished: not yet delivered (lag) plus delivered but unacknowledged. */
  private async queueBacklog(): Promise<number> {
    try {
      const info = (await this.redis.client.xinfo('GROUPS', SUBMIT_STREAM)) as unknown[];
      for (const g of info) {
        const flat = g as (string | number | null)[];
        const get = (k: string) => Number(flat[flat.indexOf(k) + 1] ?? 0) || 0;
        if (flat[flat.indexOf('name') + 1] === SCORING_GROUP) return get('lag') + get('pending');
      }
    } catch {
      // stream or group does not exist yet
    }
    return 0;
  }
}
