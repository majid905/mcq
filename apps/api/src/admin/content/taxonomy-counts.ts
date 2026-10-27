import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** "/1/12/130/" -> [1, 12, 130] */
export const idsOfPath = (path: string): number[] =>
  path
    .split('/')
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));

/**
 * `taxonomy_nodes.question_count` = published questions tagged in the subtree. Questions are tagged with
 * every ancestor, so a count is just "published questions with this tag". Recounted for the touched nodes
 * only, so an edit costs a few indexed counts, never a table scan.
 */
@Injectable()
export class TaxonomyCounts {
  constructor(private readonly prisma: PrismaService) {}

  async recount(nodeIds: Iterable<number>): Promise<void> {
    const ids = [...new Set(nodeIds)];
    if (ids.length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE taxonomy_nodes n
      SET n.question_count = (
        SELECT COUNT(*) FROM question_tags qt
        JOIN questions q ON q.id = qt.question_id
        WHERE qt.node_id = n.id AND q.status = 'published')
      WHERE n.id IN (${Prisma.join(ids)})`);
  }

  /** Tags a question must carry: each chosen node and all of its ancestors. */
  async tagsFor(nodeIds: number[]): Promise<Set<number>> {
    const nodes = await this.prisma.taxonomy_nodes.findMany({
      where: { id: { in: nodeIds } },
      select: { id: true, path: true },
    });
    const tags = new Set<number>();
    for (const n of nodes) for (const id of idsOfPath(n.path)) tags.add(id);
    return tags;
  }
}
