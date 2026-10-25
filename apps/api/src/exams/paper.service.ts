import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';

export interface PaperOption {
  key: string;
  html: string;
}

/** Same shape as the `Paper` schema in openapi.yaml. Never contains answers. */
export interface PaperDto {
  exam_id: string;
  version: number;
  mark_per_question: number;
  negative_mark: number;
  sections: { node_id: string; label: string; question_ids: string[] }[];
  questions: { id: string; body: string; options: PaperOption[] }[];
}

/** Server-side only. Stored in Redis, read by the scoring worker. */
export interface AnswerKey {
  /** question id -> correct option key */
  correct: Record<string, string>;
  /** question id -> section node id ("0" = no section) */
  section: Record<string, string>;
  sections: { node_id: string; label: string }[];
  mark_per_question: number;
  negative_mark: number;
  total_marks: number;
}

const DAY_SEC = 86_400;
export const paperKey = (examId: bigint | string) => `exam:${examId}:paper`;
export const answerKeyKey = (examId: bigint | string) => `exam:${examId}:key`;

/**
 * Paper build (docs/02 section 4): questions + options without answers go to `exam:{id}:paper`
 * (and object storage / CDN when configured); the answer key goes to `exam:{id}:key`.
 * Both live until the exam ends + 7 days and are rebuilt from MySQL on a cache miss.
 */
@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async getPaper(examId: bigint): Promise<PaperDto> {
    const cached = await this.redis.client.get(paperKey(examId));
    if (cached) return JSON.parse(cached) as PaperDto;
    return (await this.build(examId)).paper;
  }

  async getKey(examId: bigint): Promise<AnswerKey> {
    const cached = await this.redis.client.get(answerKeyKey(examId));
    if (cached) return JSON.parse(cached) as AnswerKey;
    return (await this.build(examId)).key;
  }

  async isBuilt(examId: bigint): Promise<boolean> {
    return (await this.redis.client.exists(paperKey(examId), answerKeyKey(examId))) === 2;
  }

  /** Idempotent: rebuilding yields the same bytes unless the exam content changed. */
  async build(examId: bigint): Promise<{ paper: PaperDto; key: AnswerKey }> {
    const exam = await this.prisma.exams.findUnique({ where: { id: examId } });
    if (!exam) throw new ApiException('NOT_FOUND');

    const rows = await this.prisma.exam_questions.findMany({
      where: { exam_id: examId },
      orderBy: { position: 'asc' },
      select: { question_id: true, section_node_id: true },
    });
    if (rows.length !== exam.question_count) {
      throw new ApiException('EXAM_NOT_PUBLISHABLE', {
        problems: [`expected ${exam.question_count} questions, found ${rows.length}`],
      });
    }
    const [questions, nodes] = await Promise.all([
      this.prisma.questions.findMany({
        where: { id: { in: rows.map((r) => r.question_id) } },
        select: { id: true, body: true, options: true, correct_option: true },
      }),
      this.prisma.taxonomy_nodes.findMany({
        where: { id: { in: [...new Set(rows.flatMap((r) => r.section_node_id ?? []))] } },
        select: { id: true, name_bn: true },
      }),
    ]);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const label = new Map(nodes.map((n) => [n.id, n.name_bn]));

    const sections = new Map<string, { node_id: string; label: string; question_ids: string[] }>();
    const paperQuestions: PaperDto['questions'] = [];
    const correct: Record<string, string> = {};
    const sectionOf: Record<string, string> = {};

    for (const r of rows) {
      const q = byId.get(r.question_id);
      if (!q) {
        throw new ApiException('EXAM_NOT_PUBLISHABLE', {
          problems: [`question ${r.question_id} missing`],
        });
      }
      const qid = String(q.id);
      const nodeId = r.section_node_id === null ? '0' : String(r.section_node_id);
      let section = sections.get(nodeId);
      if (!section) {
        section = {
          node_id: nodeId,
          label: r.section_node_id === null ? 'সাধারণ' : (label.get(r.section_node_id) ?? nodeId),
          question_ids: [],
        };
        sections.set(nodeId, section);
      }
      section.question_ids.push(qid);
      paperQuestions.push({
        id: qid,
        body: q.body,
        options: q.options as unknown as PaperOption[],
      });
      correct[qid] = q.correct_option;
      sectionOf[qid] = nodeId;
    }

    const paper: PaperDto = {
      exam_id: String(exam.id),
      version: exam.paper_version,
      mark_per_question: Number(exam.mark_per_question),
      negative_mark: Number(exam.negative_mark),
      sections: [...sections.values()],
      questions: paperQuestions,
    };
    const key: AnswerKey = {
      correct,
      section: sectionOf,
      sections: paper.sections.map(({ node_id, label: l }) => ({ node_id, label: l })),
      mark_per_question: paper.mark_per_question,
      negative_mark: paper.negative_mark,
      total_marks: Number(exam.total_marks),
    };

    const ttl = this.ttlSec(exam.end_at);
    const body = JSON.stringify(paper);
    await this.redis.client
      .multi()
      .set(paperKey(examId), body, 'EX', ttl)
      .set(answerKeyKey(examId), JSON.stringify(key), 'EX', ttl)
      .exec();

    const url = await this.storage.put(
      `papers/${exam.id}/v${exam.paper_version}.json`,
      body,
      'application/json',
    );
    if (url !== exam.paper_url) {
      await this.prisma.exams.update({ where: { id: examId }, data: { paper_url: url } });
    }
    this.logger.log(`paper built exam=${exam.id} v=${exam.paper_version} q=${rows.length}`);
    return { paper, key };
  }

  private ttlSec(endAt: Date | null): number {
    const base = endAt ? Math.max(0, Math.ceil((endAt.getTime() - Date.now()) / 1000)) : 0;
    return base + 7 * DAY_SEC;
  }
}
