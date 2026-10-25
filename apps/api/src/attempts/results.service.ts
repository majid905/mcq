import { Injectable } from '@nestjs/common';
import type { attempts, exams, users } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { Page } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { metaKey } from './attempt-state';
import { percentile, type SectionScore } from './scoring';
import { lbDistrictKey, lbKey } from './scoring.service';

type Locale = users['locale'];

export interface AttemptResultDto {
  attempt_id: string;
  exam_id: string | null;
  title: string;
  total_questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  total_marks: number;
  negative_marks: number;
  accuracy_pct: number;
  time_taken_sec: number;
  passed: boolean | null;
  rank: {
    overall: number;
    district: number | null;
    percentile: number;
    participants: number;
    is_final: boolean;
  } | null;
  sections: {
    node_id: string;
    label: string;
    correct: number;
    wrong: number;
    skipped: number;
    score: number;
  }[];
  solutions_available: boolean;
  solutions_available_at: string | null;
}

export type SolutionFilter = 'all' | 'wrong' | 'skipped' | 'correct';

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Own attempt or 404; the user id is part of every attempts query (docs/03 rule 6). */
  async mine(userId: bigint, attemptId: bigint): Promise<attempts> {
    const row = await this.prisma.attempts.findFirst({ where: { id: attemptId, user_id: userId } });
    if (!row) throw new ApiException('NOT_FOUND');
    return row;
  }

  /** `null` means "still scoring" (HTTP 202). */
  async result(user: Pick<users, 'id' | 'locale'>, attemptId: bigint) {
    const row = await this.mine(user.id, attemptId);
    if (row.status !== 'scored') {
      const submitted =
        row.status === 'submitted' ||
        (await this.redis.client.hget(metaKey(attemptId), 'status')) === 'submitted' ||
        (await this.pastDeadline(row));
      if (!submitted) throw new ApiException('FORBIDDEN', undefined, 'Attempt not submitted yet');
      return null;
    }
    const exam = row.exam_id
      ? await this.prisma.exams.findUnique({ where: { id: row.exam_id } })
      : null;
    return this.build(row, exam, user.locale);
  }

  private async pastDeadline(row: attempts): Promise<boolean> {
    // Auto-submit by the scheduler is due once the deadline + grace has passed.
    const ends = await this.redis.client.hget(metaKey(row.id), 'ends_ms');
    return ends !== null && Date.now() > Number(ends) + 60_000;
  }

  private async build(
    row: attempts,
    exam: exams | null,
    locale: Locale,
  ): Promise<AttemptResultDto> {
    const correct = row.correct_count ?? 0;
    const wrong = row.wrong_count ?? 0;
    const negativeMark = exam ? Number(exam.negative_mark) : 0;
    const score = Number(row.score ?? 0);
    const sections = Array.isArray(row.section_scores)
      ? (row.section_scores as unknown as SectionScore[])
      : [];
    const live = row.kind === 'live' && exam !== null;
    const endsAt = live ? (exam.end_at ?? null) : null;
    const unlocked = !endsAt || Date.now() >= endsAt.getTime();
    return {
      attempt_id: String(row.id),
      exam_id: row.exam_id === null ? null : String(row.exam_id),
      title: exam
        ? locale === 'en'
          ? exam.title_en
          : exam.title_bn
        : locale === 'en'
          ? 'Practice'
          : 'অনুশীলন',
      total_questions: row.total_questions,
      correct,
      wrong,
      skipped: row.skipped_count ?? 0,
      score,
      total_marks: exam ? Number(exam.total_marks) : row.total_questions,
      negative_marks: Math.round(wrong * negativeMark * 100) / 100,
      accuracy_pct: correct + wrong > 0 ? round1((correct / (correct + wrong)) * 100) : 0,
      time_taken_sec: row.time_taken_sec ?? 0,
      passed: exam?.pass_marks != null ? score >= Number(exam.pass_marks) : null,
      rank: live ? await this.rank(row, exam) : null,
      sections: sections.map((s) => ({
        node_id: s.node_id,
        label: s.label,
        correct: s.correct,
        wrong: s.wrong,
        skipped: s.skipped,
        score: s.score,
      })),
      solutions_available: unlocked,
      solutions_available_at: endsAt && !unlocked ? endsAt.toISOString() : null,
    };
  }

  /** Final numbers once merit is published, otherwise provisional ones straight from Redis. */
  private async rank(row: attempts, exam: exams): Promise<AttemptResultDto['rank']> {
    const member = String(row.user_id);
    const participants = await this.redis.client.zcard(lbKey(exam.id));
    if (row.rank_overall !== null && exam.status === 'merit_published') {
      return {
        overall: row.rank_overall,
        district: row.rank_district,
        percentile: Number(row.percentile ?? 0),
        participants,
        is_final: true,
      };
    }
    const idx = await this.redis.client.zrevrank(lbKey(exam.id), member);
    if (idx === null) return null;
    let district: number | null = null;
    if (row.district_id !== null) {
      const d = await this.redis.client.zrevrank(
        lbDistrictKey(exam.id, String(row.district_id)),
        member,
      );
      district = d === null ? null : d + 1;
    }
    return {
      overall: idx + 1,
      district,
      percentile: percentile(idx + 1, participants),
      participants,
      is_final: false,
    };
  }

  /** FR-RES-05. Live exams reveal answers only after `end_at`. */
  async solutions(userId: bigint, attemptId: bigint, filter: SolutionFilter) {
    const row = await this.mine(userId, attemptId);
    const exam = row.exam_id
      ? await this.prisma.exams.findUnique({ where: { id: row.exam_id } })
      : null;
    if (row.exam_id && !exam) throw new ApiException('NOT_FOUND');
    if (row.kind === 'live' && exam?.end_at && Date.now() < exam.end_at.getTime()) {
      throw new ApiException('SOLUTIONS_LOCKED', { available_at: exam.end_at.toISOString() });
    }
    if (row.status !== 'scored') throw new ApiException('FORBIDDEN', undefined, 'Not scored yet');

    // Exam attempts follow the exam's order; practice/custom sessions keep their own question list.
    const sessionIds = Array.isArray(row.question_ids)
      ? (row.question_ids as (string | number)[]).map((i) => BigInt(i))
      : [];
    if (!row.exam_id && sessionIds.length === 0) throw new ApiException('NOT_FOUND');
    const links = row.exam_id
      ? await this.prisma.exam_questions.findMany({
          where: { exam_id: row.exam_id },
          orderBy: { position: 'asc' },
          select: { question_id: true, position: true },
        })
      : sessionIds.map((question_id, i) => ({ question_id, position: i + 1 }));
    const questions = await this.prisma.questions.findMany({
      where: { id: { in: links.map((l) => l.question_id) } },
      select: {
        id: true,
        body: true,
        options: true,
        correct_option: true,
        explanation: true,
        difficulty: true,
        source_exams: { select: { name_bn: true } },
      },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const given = (row.answers ?? {}) as Record<string, string>;

    const items = links.flatMap((l) => {
      const q = byId.get(l.question_id);
      if (!q) return [];
      const mine = given[String(q.id)] ?? null;
      const result = mine === null ? 'skipped' : mine === q.correct_option ? 'correct' : 'wrong';
      if (filter !== 'all' && filter !== result) return [];
      return [
        {
          position: l.position,
          question: {
            id: String(q.id),
            body: q.body,
            options: q.options,
            correct_option: q.correct_option,
            explanation: q.explanation,
            answer_locked: false,
            difficulty: q.difficulty,
            source_label: q.source_exams?.name_bn ?? null,
          },
          my_answer: mine,
          result,
        },
      ];
    });
    return items;
  }

  /** `GET /me/attempts`: newest first, cursor `<started_ms>_<id>`. */
  async history(
    user: Pick<users, 'id' | 'locale'>,
    opts: { cursor?: string; limit: number; kind?: attempts['kind'] },
  ) {
    let cursorFilter = {};
    if (opts.cursor) {
      const m = /^(\d{1,15})_(\d{1,19})$/.exec(opts.cursor);
      if (!m?.[1] || !m[2]) {
        throw new ApiException('VALIDATION_FAILED', { fields: { cursor: 'invalid cursor' } });
      }
      const at = new Date(Number(m[1]));
      cursorFilter = {
        OR: [{ started_at: { lt: at } }, { started_at: at, id: { lt: BigInt(m[2]) } }],
      };
    }
    const rows = await this.prisma.attempts.findMany({
      where: { user_id: user.id, ...(opts.kind ? { kind: opts.kind } : {}), ...cursorFilter },
      orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
    });
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const exams = await this.prisma.exams.findMany({
      where: { id: { in: [...new Set(page.flatMap((r) => r.exam_id ?? []))] } },
      select: { id: true, title_bn: true, title_en: true, total_marks: true },
    });
    const byId = new Map(exams.map((e) => [e.id, e]));
    const items = page.map((r) => {
      const e = r.exam_id === null ? undefined : byId.get(r.exam_id);
      return {
        attempt_id: String(r.id),
        kind: r.kind,
        title: e
          ? user.locale === 'en'
            ? e.title_en
            : e.title_bn
          : user.locale === 'en'
            ? 'Practice'
            : 'অনুশীলন',
        started_at: r.started_at.toISOString(),
        status: r.status,
        score: r.score === null ? null : Number(r.score),
        total_marks: e ? Number(e.total_marks) : r.total_questions,
        rank_overall: r.rank_overall,
      };
    });
    const last = page[page.length - 1];
    return new Page(items, {
      next_cursor: hasMore && last ? `${last.started_at.getTime()}_${last.id}` : null,
      has_more: hasMore,
    });
  }
}
