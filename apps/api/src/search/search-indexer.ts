import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { htmlToText } from './html-text';
import { MeiliClient } from './meili.client';

export interface QuestionDoc {
  id: string;
  body_text: string;
  options_text: string;
  explanation_text: string;
  category_id: number;
  node_ids: number[];
  year: number | null;
  status: string;
  difficulty: number;
}

const BATCH = 500;

/** Builds search documents from MySQL and keeps the Meilisearch index in step (outbox + reindex). */
@Injectable()
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meili: MeiliClient,
  ) {}

  /** Documents for these ids. Ids that are missing or not published are returned in `gone`. */
  async documents(ids: bigint[]): Promise<{ docs: QuestionDoc[]; gone: string[] }> {
    if (ids.length === 0) return { docs: [], gone: [] };
    const rows = await this.prisma.questions.findMany({
      where: { id: { in: ids }, status: 'published' },
      select: {
        id: true,
        body_text: true,
        options: true,
        explanation: true,
        primary_node_id: true,
        source_year: true,
        status: true,
        difficulty: true,
      },
    });
    const [tags, nodes] = await Promise.all([
      this.prisma.question_tags.findMany({
        where: { question_id: { in: rows.map((r) => r.id) } },
        select: { question_id: true, node_id: true },
      }),
      this.prisma.taxonomy_nodes.findMany({ select: { id: true, path: true } }),
    ]);
    const pathOf = new Map(nodes.map((n) => [n.id, n.path]));
    const tagsBy = new Map<bigint, number[]>();
    for (const t of tags)
      tagsBy.set(t.question_id, [...(tagsBy.get(t.question_id) ?? []), t.node_id]);

    const docs = rows.map((r): QuestionDoc => {
      // Every ancestor counts, so filtering by subject or category finds the question too.
      const direct = [r.primary_node_id, ...(tagsBy.get(r.id) ?? [])];
      const all = new Set<number>();
      for (const n of direct) {
        all.add(n);
        for (const seg of (pathOf.get(n) ?? '').split('/')) if (seg) all.add(Number(seg));
      }
      const category = Number((pathOf.get(r.primary_node_id) ?? '').split('/')[1] ?? 0);
      const options = r.options as unknown as { html: string }[];
      return {
        id: String(r.id),
        body_text: r.body_text,
        options_text: options.map((o) => htmlToText(o.html)).join(' | '),
        explanation_text: htmlToText(r.explanation),
        category_id: category,
        node_ids: [...all],
        year: r.source_year,
        status: r.status,
        difficulty: r.difficulty,
      };
    });
    const present = new Set(docs.map((d) => d.id));
    return { docs, gone: ids.map(String).filter((id) => !present.has(id)) };
  }

  /** Applies the pending `search_outbox` rows (oldest first). Returns how many were handled. */
  async syncOutbox(): Promise<number> {
    if (!this.meili.enabled) return 0;
    const rows = await this.prisma.search_outbox.findMany({
      where: { processed_at: null },
      orderBy: { id: 'asc' },
      take: BATCH,
    });
    if (rows.length === 0) return 0;
    const ids = [...new Set(rows.map((r) => r.question_id))];
    // Whatever the action says, the current state in MySQL decides: published -> index, else remove.
    const { docs, gone } = await this.documents(ids);
    if (docs.length > 0) await this.meili.waitFor(await this.meili.addDocuments(docs));
    if (gone.length > 0) await this.meili.waitFor(await this.meili.deleteDocuments(gone));
    await this.prisma.search_outbox.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { processed_at: new Date() },
    });
    return rows.length;
  }

  /** Disaster recovery / first fill: rebuilds the whole index from MySQL. */
  async reindexAll(onProgress?: (done: number) => void): Promise<number> {
    await this.meili.ensureIndex();
    await this.meili.waitFor(await this.meili.deleteAll());
    let after = 0n;
    let total = 0;
    for (;;) {
      const ids = await this.prisma.questions.findMany({
        where: { status: 'published', id: { gt: after } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 1000,
      });
      if (ids.length === 0) break;
      const { docs } = await this.documents(ids.map((i) => i.id));
      if (docs.length > 0) await this.meili.waitFor(await this.meili.addDocuments(docs));
      total += docs.length;
      after = ids[ids.length - 1]?.id ?? after;
      onProgress?.(total);
    }
    // Everything is current now, so older pending outbox rows are redundant.
    await this.prisma.search_outbox.updateMany({
      where: { processed_at: null },
      data: { processed_at: new Date() },
    });
    this.logger.log(`reindexed ${total} questions`);
    return total;
  }
}
