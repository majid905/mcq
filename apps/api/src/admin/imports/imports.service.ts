import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type import_jobs } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { Page } from '../../common/page';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FILE_STORE, type FileStore } from '../../storage/file-store';
import type { AuditActor } from '../audit.service';
import { AuditService } from '../audit.service';
import { TaxonomyCounts } from '../content/taxonomy-counts';
import { MAX_IMPORT_BYTES, keyOfRef, uploadRef } from '../uploads/uploads.service';
import {
  checkMapping,
  mapRow,
  suggestMapping,
  type Lookups,
  type Mapping,
  type RowQuestion,
} from './mapping';
import { parseTable, type Table } from './parsers';

export const IMPORT_STREAM = 'q:import';
export const IMPORT_GROUP = 'importers';

const BATCH = 1000;
const PREVIEW_ROWS = 20;
const MAX_ERRORS_SHOWN = 200;
const META_TTL_SEC = 7 * 86_400;
const metaKey = (id: bigint | string) => `import:${id}:meta`;

type Phase = 'validate' | 'run';
export type Status = 'draft' | 'in_review' | 'published';

interface RowError {
  row: number;
  field: string;
  message: string;
}
/** Things the UI shows that MySQL has no column for. Kept in Redis for a week. */
interface Meta {
  columns: string[];
  preview_rows: Record<string, string>[];
  suggested_mapping: Mapping;
  valid_rows: number;
  row_errors: RowError[];
  failure: string | null;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** FR-ADM-07: upload -> mapping -> validate -> import, the heavy steps run in the worker process. */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly counts: TaxonomyCounts,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  // ------------------------------------------------------------------ API side

  private async meta(id: bigint): Promise<Meta> {
    const raw = await this.redis.client.get(metaKey(id));
    return raw
      ? (JSON.parse(raw) as Meta)
      : {
          columns: [],
          preview_rows: [],
          suggested_mapping: {},
          valid_rows: 0,
          row_errors: [],
          failure: null,
        };
  }

  private saveMeta(id: bigint, meta: Meta) {
    return this.redis.client.set(metaKey(id), JSON.stringify(meta), 'EX', META_TTL_SEC);
  }

  private dto(job: import_jobs, meta: Meta) {
    return {
      id: String(job.id),
      file_name: job.file_name,
      status: job.status,
      columns: meta.columns,
      preview_rows: meta.preview_rows,
      suggested_mapping: meta.suggested_mapping,
      total_rows: job.total_rows,
      valid_rows: meta.valid_rows,
      imported_rows: job.imported_rows,
      duplicate_rows: job.duplicate_rows,
      failed_rows: job.failed_rows,
      row_errors: meta.row_errors,
      failure: meta.failure,
      error_file_url: this.errorLink(job),
      created_at: job.created_at.toISOString(),
      finished_at: job.finished_at?.toISOString() ?? null,
    };
  }

  private errorLink(job: import_jobs): string | null {
    const key = job.error_file_url ? keyOfRef(job.error_file_url) : null;
    return key ? this.store.presignGet(key, 900) : null;
  }

  private async load(rawId: string, actor: { admin: { id: bigint } }, anyOwner = false) {
    const job = await this.prisma.import_jobs.findUnique({ where: { id: parseId(rawId) } });
    if (!job || (!anyOwner && BigInt(job.admin_id) !== actor.admin.id)) {
      throw new ApiException('NOT_FOUND');
    }
    return job;
  }

  async get(actor: AuditActor, rawId: string, seeAll: boolean) {
    const job = await this.load(rawId, actor, seeAll);
    return this.dto(job, await this.meta(job.id));
  }

  async list(actor: AuditActor, seeAll: boolean, cursor: string | undefined, limit: number) {
    const before = cursor ? parseId(cursor) : null;
    const rows = await this.prisma.import_jobs.findMany({
      where: {
        ...(seeAll ? {} : { admin_id: Number(actor.admin.id) }),
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return new Page(await Promise.all(items.map(async (j) => this.dto(j, await this.meta(j.id)))), {
      next_cursor: hasMore && last ? String(last.id) : null,
      has_more: hasMore,
    });
  }

  /** Reads the uploaded file, detects columns, keeps the first rows for the preview. */
  async create(actor: AuditActor, fileUrl: string, fileName: string) {
    const key = keyOfRef(fileUrl);
    if (!key || !key.startsWith(`imports/${actor.admin.id}/`)) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { file_url: 'use the public_url returned by POST /admin/uploads (import_file)' },
      });
    }
    const table = await this.readTable(key, fileName);
    if (table.columns.length === 0 || table.rows.length === 0) {
      throw new ApiException('VALIDATION_FAILED', { fields: { file_url: 'the file has no rows' } });
    }
    const job = await this.prisma.import_jobs.create({
      data: {
        admin_id: Number(actor.admin.id),
        file_url: uploadRef(key),
        file_name: fileName.slice(0, 255),
        total_rows: table.rows.length,
      },
    });
    const meta: Meta = {
      columns: table.columns,
      preview_rows: table.rows.slice(0, PREVIEW_ROWS),
      suggested_mapping: suggestMapping(table.columns),
      valid_rows: 0,
      row_errors: [],
      failure: null,
    };
    await this.saveMeta(job.id, meta);
    await this.audit.record(actor, {
      action: 'import.create',
      entityType: 'import',
      entityId: job.id,
      after: { file_name: fileName, rows: table.rows.length },
    });
    return this.dto(job, meta);
  }

  private async readTable(key: string, fileName: string): Promise<Table> {
    try {
      const buf = await this.store.read(key, MAX_IMPORT_BYTES);
      return await parseTable(fileName, buf);
    } catch (err) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { file_url: `cannot read the file: ${(err as Error).message}` },
      });
    }
  }

  async startValidate(
    actor: AuditActor,
    rawId: string,
    mapping: Mapping,
    defaultStatus: Status,
  ): Promise<void> {
    const job = await this.load(rawId, actor);
    if (!['uploaded', 'validated', 'failed'].includes(job.status)) {
      throw new ApiException('CONFLICT', undefined, 'এই import এখন চলছে বা শেষ হয়েছে');
    }
    const meta = await this.meta(job.id);
    const problems = checkMapping(mapping, meta.columns);
    if (problems.length > 0) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: Object.fromEntries(problems.map((p) => [p.field, p.message])),
      });
    }
    await this.prisma.import_jobs.update({
      where: { id: job.id },
      data: { mapping, default_status: defaultStatus, status: 'validating' },
    });
    await this.enqueue(job.id, 'validate');
  }

  async startRun(actor: AuditActor, rawId: string): Promise<void> {
    const job = await this.load(rawId, actor);
    if (job.status !== 'validated') {
      throw new ApiException('CONFLICT', undefined, 'আগে validate করুন');
    }
    const claimed = await this.prisma.import_jobs.updateMany({
      where: { id: job.id, status: 'validated' },
      data: { status: 'importing', imported_rows: 0 },
    });
    if (claimed.count === 0) throw new ApiException('CONFLICT');
    await this.enqueue(job.id, 'run');
  }

  private async enqueue(id: bigint, phase: Phase) {
    await this.redis.client.xadd(IMPORT_STREAM, '*', 'job_id', String(id), 'phase', phase);
  }

  // ------------------------------------------------------------------ worker side

  /** Entry point for the stream consumer. Errors end the job as `failed`; they never escape. */
  async process(jobId: bigint, phase: Phase): Promise<void> {
    try {
      if (phase === 'validate') await this.validate(jobId);
      else await this.run(jobId);
    } catch (err) {
      this.logger.error(`import ${jobId} ${phase} failed: ${(err as Error).message}`);
      const meta = await this.meta(jobId);
      meta.failure = (err as Error).message.slice(0, 500);
      await this.saveMeta(jobId, meta);
      // updateMany: the job row may be gone (stale stream entry); that must not crash the worker.
      await this.prisma.import_jobs.updateMany({
        where: { id: jobId },
        data: { status: 'failed', finished_at: new Date() },
      });
    }
  }

  private async lookups(): Promise<Lookups> {
    const [nodes, sources] = await Promise.all([
      this.prisma.taxonomy_nodes.findMany({
        select: { id: true, slug: true, name_bn: true, name_en: true, type: true },
      }),
      this.prisma.source_exams.findMany({
        select: { id: true, slug: true, name_bn: true, name_en: true },
      }),
    ]);
    const add = (m: Map<string, number[]>, key: string, id: number) => {
      const k = key.trim().toLowerCase();
      const list = m.get(k) ?? [];
      if (!list.includes(id)) list.push(id);
      m.set(k, list);
    };
    const topics = new Map<string, number[]>();
    for (const n of nodes) {
      add(topics, String(n.id), n.id);
      // Names and slugs repeat across the tree ("History" under several subjects): ambiguity is reported.
      for (const k of [n.slug, n.name_bn, n.name_en]) add(topics, k, n.id);
    }
    const src = new Map<string, number[]>();
    for (const s of sources)
      for (const k of [String(s.id), s.slug, s.name_bn, s.name_en]) add(src, k, s.id);
    return { topics, sources: src };
  }

  private async mapAll(job: import_jobs) {
    const key = keyOfRef(job.file_url) as string;
    const table = await parseTable(job.file_name, await this.store.read(key, MAX_IMPORT_BYTES));
    const lookups = await this.lookups();
    const mapping = (job.mapping ?? {}) as Mapping;
    const good: { row: number; q: RowQuestion }[] = [];
    const failed: { row: number; field: string; message: string; raw: Record<string, string> }[] =
      [];
    const seen = new Map<string, number>();
    const dupInFile: { row: number; raw: Record<string, string> }[] = [];
    table.rows.forEach((raw, i) => {
      const rowNo = i + 2; // spreadsheet numbering: row 1 is the header
      const r = mapRow(raw, mapping, lookups);
      if (!r.ok) return void failed.push({ row: rowNo, field: r.field, message: r.message, raw });
      if (seen.has(r.question.hash)) return void dupInFile.push({ row: rowNo, raw });
      seen.set(r.question.hash, rowNo);
      good.push({ row: rowNo, q: r.question });
    });
    return { table, good, failed, dupInFile };
  }

  /** Which of these hashes already exist as questions. */
  private async existingHashes(hashes: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < hashes.length; i += 2000) {
      const rows = await this.prisma.questions.findMany({
        where: { content_hash: { in: hashes.slice(i, i + 2000) } },
        select: { content_hash: true },
      });
      for (const r of rows) found.add(r.content_hash);
    }
    return found;
  }

  private async validate(jobId: bigint): Promise<void> {
    const job = await this.prisma.import_jobs.findUniqueOrThrow({ where: { id: jobId } });
    const { table, good, failed, dupInFile } = await this.mapAll(job);
    const existing = await this.existingHashes(good.map((g) => g.q.hash));
    const dupInDb = good.filter((g) => existing.has(g.q.hash));
    const valid = good.length - dupInDb.length;

    const errors: RowError[] = failed.map((f) => ({
      row: f.row,
      field: f.field,
      message: f.message,
    }));
    const lines = [
      ['row', 'result', 'field', 'message', ...table.columns].map(csvCell).join(','),
      ...failed.map((f) =>
        [String(f.row), 'failed', f.field, f.message, ...table.columns.map((c) => f.raw[c] ?? '')]
          .map(csvCell)
          .join(','),
      ),
      ...dupInFile.map((d) =>
        [
          String(d.row),
          'duplicate',
          '',
          'same question appears earlier in the file',
          ...table.columns.map((c) => d.raw[c] ?? ''),
        ]
          .map(csvCell)
          .join(','),
      ),
      ...dupInDb.map((d) =>
        [
          String(d.row),
          'duplicate',
          '',
          'already in the question bank',
          ...table.columns.map(() => ''),
        ]
          .map(csvCell)
          .join(','),
      ),
    ];
    let errorRef: string | null = null;
    if (lines.length > 1) {
      const key = `imports/${job.admin_id}/${job.id}-errors.csv`;
      await this.store.write(key, `\uFEFF${lines.join('\n')}\n`, 'text/csv');
      errorRef = uploadRef(key);
    }

    const meta = await this.meta(jobId);
    meta.valid_rows = valid;
    meta.row_errors = errors.slice(0, MAX_ERRORS_SHOWN);
    meta.failure = null;
    await this.saveMeta(jobId, meta);
    await this.prisma.import_jobs.update({
      where: { id: jobId },
      data: {
        status: 'validated',
        total_rows: table.rows.length,
        failed_rows: failed.length,
        duplicate_rows: dupInFile.length + dupInDb.length,
        error_file_url: errorRef,
      },
    });
  }

  private async run(jobId: bigint): Promise<void> {
    const job = await this.prisma.import_jobs.findUniqueOrThrow({ where: { id: jobId } });
    const { good } = await this.mapAll(job);
    const status = job.default_status;
    const now = new Date();
    let imported = 0;
    let raced = 0;
    const touched = new Set<number>();
    // Everything this run inserts gets an id above this; pre-existing duplicates have lower ids.
    const baseId = (await this.prisma.questions.aggregate({ _max: { id: true } }))._max.id ?? 0n;

    for (let i = 0; i < good.length; i += BATCH) {
      const chunk = good.slice(i, i + BATCH);
      const created = await this.prisma.questions.createMany({
        data: chunk.map(({ q }) => ({
          body: q.body,
          body_text: q.bodyText,
          options: q.options as unknown as Prisma.InputJsonValue,
          correct_option: q.correct,
          explanation: q.explanation,
          difficulty: q.difficulty,
          status,
          source_exam_id: q.sourceExamId,
          source_year: q.sourceYear,
          primary_node_id: q.nodeId,
          content_hash: q.hash,
          is_premium: q.isPremium,
          created_by: Number(job.admin_id),
          ...(status === 'published' ? { published_at: now } : {}),
        })),
        skipDuplicates: true,
      });
      imported += created.count;
      raced += chunk.length - created.count; // someone else added the same question meanwhile

      const rows = await this.prisma.questions.findMany({
        where: {
          content_hash: { in: chunk.map((c) => c.q.hash) },
          created_by: Number(job.admin_id),
        },
        select: { id: true, primary_node_id: true },
      });
      // Only rows this batch created get tags (a pre-existing duplicate keeps its own).
      const fresh = rows.filter((r) => r.id > baseId);
      const tagsByNode = new Map<number, Set<number>>();
      const rowsOut: { question_id: bigint; node_id: number }[] = [];
      for (const r of fresh) {
        let tags = tagsByNode.get(r.primary_node_id);
        if (!tags) {
          tags = await this.counts.tagsFor([r.primary_node_id]);
          tagsByNode.set(r.primary_node_id, tags);
        }
        for (const t of tags) {
          rowsOut.push({ question_id: r.id, node_id: t });
          touched.add(t);
        }
      }
      await this.prisma.question_tags.createMany({ data: rowsOut, skipDuplicates: true });
      await this.prisma.search_outbox.createMany({
        data: fresh.map((r) => ({ question_id: r.id, action: 'upsert' as const })),
      });
      if (status === 'published' && fresh.length > 0) {
        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE questions SET slug = CONCAT('q-', id) WHERE slug IS NULL AND id IN (${Prisma.join(fresh.map((r) => r.id))})`,
        );
      }
      await this.prisma.import_jobs.update({
        where: { id: jobId },
        data: { imported_rows: imported },
      });
    }

    if (status === 'published') await this.counts.recount(touched);
    await this.prisma.import_jobs.update({
      where: { id: jobId },
      data: {
        status: 'done',
        imported_rows: imported,
        duplicate_rows: { increment: raced },
        finished_at: new Date(),
      },
    });
    await this.audit.record(
      { admin: { id: BigInt(job.admin_id) } },
      {
        action: 'import.run',
        entityType: 'import',
        entityId: jobId,
        after: { imported, status, file_name: job.file_name },
      },
    );
  }
}
