import { Injectable } from '@nestjs/common';
import { Prisma, type taxonomy_nodes } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TaxonomyNodeDto {
  id: string;
  parent_id: string | null;
  type: 'category' | 'subject' | 'chapter' | 'topic';
  name_bn: string;
  name_en: string;
  slug: string;
  icon: string | null;
  question_count: number;
  has_children: boolean;
  progress: { attempted: number; accuracy_pct: number } | null;
}

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nodes as DTOs without progress. `has_children` is unknown here, so it is reported as false. */
  toDtos(nodes: taxonomy_nodes[], _locale: 'bn' | 'en'): Map<number, TaxonomyNodeDto> {
    return new Map(nodes.map((n) => [n.id, this.dto(n, false, null)]));
  }

  private dto(
    n: taxonomy_nodes,
    hasChildren: boolean,
    progress: TaxonomyNodeDto['progress'],
  ): TaxonomyNodeDto {
    return {
      id: String(n.id),
      parent_id: n.parent_id === null ? null : String(n.parent_id),
      type: n.type,
      name_bn: n.name_bn,
      name_en: n.name_en,
      slug: n.slug,
      icon: n.icon,
      question_count: n.question_count,
      has_children: hasChildren,
      progress,
    };
  }

  /** Sum of the user's per-topic stats over each node's whole subtree (materialized path). */
  async subtreeStats(
    ids: number[],
    userId: bigint,
  ): Promise<Map<number, { attempted: number; correct: number }>> {
    const out = new Map<number, { attempted: number; correct: number }>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<
      { id: number | bigint; attempted: bigint | null; correct: bigint | null }[]
    >(Prisma.sql`
      SELECT c.id, SUM(s.attempted) AS attempted, SUM(s.correct) AS correct
      FROM taxonomy_nodes c
      JOIN taxonomy_nodes d ON d.path LIKE CONCAT(c.path, '%')
      JOIN user_topic_stats s ON s.node_id = d.id AND s.user_id = ${userId}
      WHERE c.id IN (${Prisma.join(ids)})
      GROUP BY c.id`);
    for (const r of rows) {
      out.set(Number(r.id), {
        attempted: Number(r.attempted ?? 0),
        correct: Number(r.correct ?? 0),
      });
    }
    return out;
  }

  /** FR-PRAC-01: children of `parentId` (roots when null), with the user's progress per subtree. */
  async children(parentId: number | null, userId?: bigint): Promise<TaxonomyNodeDto[]> {
    const nodes = await this.prisma.taxonomy_nodes.findMany({
      where: { parent_id: parentId, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    if (nodes.length === 0) return [];
    const ids = nodes.map((n) => n.id);

    const withChildren = await this.prisma.taxonomy_nodes.groupBy({
      by: ['parent_id'],
      where: { parent_id: { in: ids }, is_active: true },
    });
    const parents = new Set(withChildren.map((g) => g.parent_id));

    const progress = userId ? await this.subtreeStats(ids, userId) : new Map();

    return nodes.map((n) => {
      const p = userId ? (progress.get(n.id) ?? { attempted: 0, correct: 0 }) : null;
      return this.dto(
        n,
        parents.has(n.id),
        p
          ? {
              attempted: p.attempted,
              accuracy_pct: p.attempted > 0 ? Math.round((p.correct / p.attempted) * 1000) / 10 : 0,
            }
          : null,
      );
    });
  }
}
