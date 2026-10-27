import { Injectable } from '@nestjs/common';
import { Prisma, type taxonomy_nodes } from '@prisma/client';
import { ApiException } from '../../common/api-exception';
import { parseId } from '../../common/ids';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../audit.service';

type NodeType = 'category' | 'subject' | 'chapter' | 'topic';
const RANK: Record<NodeType, number> = { category: 0, subject: 1, chapter: 2, topic: 3 };
const MAX_DEPTH = 4;

export interface TaxonomyInput {
  parent_id?: string | null | undefined;
  type: NodeType;
  name_bn: string;
  name_en: string;
  slug?: string | undefined;
  sort_order?: number | undefined;
  icon?: string | undefined;
  is_active?: boolean | undefined;
}

export interface ReorderItem {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);

/** FR-ADM-09: taxonomy tree editing. Paths are materialised ("/1/12/"), so moves rewrite a subtree. */
@Injectable()
export class TaxonomyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private dto(n: taxonomy_nodes, hasChildren = false) {
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
      progress: null,
    };
  }

  private async slugFree(parentId: number | null, slug: string, exceptId?: number) {
    const clash = await this.prisma.taxonomy_nodes.findFirst({
      where: { parent_id: parentId, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (clash) throw new ApiException('CONFLICT', { field: 'slug' }, 'এই slug আগে থেকেই আছে');
  }

  private async parentFor(raw: string | null | undefined, type: NodeType) {
    if (raw === null || raw === undefined) {
      if (type !== 'category') {
        throw new ApiException('VALIDATION_FAILED', {
          fields: { type: 'root nodes are categories' },
        });
      }
      return null;
    }
    const parent = await this.prisma.taxonomy_nodes.findUnique({
      where: { id: Number(parseId(raw)) },
    });
    if (!parent) throw new ApiException('VALIDATION_FAILED', { fields: { parent_id: 'unknown' } });
    if (RANK[type] <= RANK[parent.type]) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { type: `${type} cannot sit under ${parent.type}` },
      });
    }
    if (parent.depth + 1 >= MAX_DEPTH) {
      throw new ApiException('VALIDATION_FAILED', { fields: { parent_id: 'tree is too deep' } });
    }
    return parent;
  }

  async create(actor: Actor, i: TaxonomyInput) {
    const parent = await this.parentFor(i.parent_id, i.type);
    const slug = i.slug ? slugify(i.slug) : slugify(i.name_en) || `n-${Date.now()}`;
    await this.slugFree(parent?.id ?? null, slug);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taxonomy_nodes.create({
        data: {
          parent_id: parent?.id ?? null,
          type: i.type,
          name_bn: i.name_bn,
          name_en: i.name_en,
          slug,
          path: '/',
          depth: parent ? parent.depth + 1 : 0,
          sort_order: i.sort_order ?? 0,
          icon: i.icon ?? null,
          is_active: i.is_active ?? true,
        },
      });
      return tx.taxonomy_nodes.update({
        where: { id: created.id },
        data: { path: `${parent?.path ?? '/'}${created.id}/` },
      });
    });
    const dto = this.dto(row);
    await this.audit.record(actor, {
      action: 'taxonomy.create',
      entityType: 'taxonomy',
      entityId: row.id,
      after: dto,
    });
    return dto;
  }

  async update(actor: Actor, rawId: string, i: TaxonomyInput) {
    const id = Number(parseId(rawId));
    const before = await this.prisma.taxonomy_nodes.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const sameParent =
      (i.parent_id ?? null) === (before.parent_id === null ? null : String(before.parent_id));
    if (i.type !== before.type || !sameParent) {
      throw new ApiException('VALIDATION_FAILED', {
        fields: { parent_id: 'use POST /admin/taxonomy/reorder to move a node; the type is fixed' },
      });
    }
    const slug = i.slug ? slugify(i.slug) : before.slug;
    if (slug !== before.slug) await this.slugFree(before.parent_id, slug, id);
    const row = await this.prisma.taxonomy_nodes.update({
      where: { id },
      data: {
        name_bn: i.name_bn,
        name_en: i.name_en,
        slug,
        sort_order: i.sort_order ?? before.sort_order,
        icon: i.icon ?? before.icon,
        is_active: i.is_active ?? before.is_active,
      },
    });
    await this.audit.record(actor, {
      action: 'taxonomy.update',
      entityType: 'taxonomy',
      entityId: id,
      before: this.dto(before),
      after: this.dto(row),
    });
    return this.dto(row);
  }

  async remove(actor: Actor, rawId: string): Promise<void> {
    const id = Number(parseId(rawId));
    const before = await this.prisma.taxonomy_nodes.findUnique({ where: { id } });
    if (!before) throw new ApiException('NOT_FOUND');
    const [children, tagged] = await Promise.all([
      this.prisma.taxonomy_nodes.count({ where: { parent_id: id } }),
      this.prisma.question_tags.count({ where: { node_id: id } }),
    ]);
    if (children + tagged > 0) throw new ApiException('IN_USE', { children, questions: tagged });
    await this.prisma.taxonomy_nodes.delete({ where: { id } });
    await this.audit.record(actor, {
      action: 'taxonomy.delete',
      entityType: 'taxonomy',
      entityId: id,
      before: this.dto(before),
    });
  }

  /**
   * Drag-and-drop result. Order changes are free. Moving a node to another parent rewrites the paths
   * of its subtree, and is refused while questions are tagged in it (their ancestor tags would go stale).
   */
  async reorder(actor: Actor, items: ReorderItem[]): Promise<void> {
    const ids = items.map((x) => Number(parseId(x.id)));
    if (new Set(ids).size !== ids.length) {
      throw new ApiException('VALIDATION_FAILED', { fields: { items: 'duplicate id' } });
    }
    const nodes = new Map(
      (await this.prisma.taxonomy_nodes.findMany({ where: { id: { in: ids } } })).map((n) => [
        n.id,
        n,
      ]),
    );
    if (nodes.size !== ids.length) throw new ApiException('NOT_FOUND');

    const moves: { node: taxonomy_nodes; parent: taxonomy_nodes | null }[] = [];
    for (const it of items) {
      const node = nodes.get(Number(it.id)) as taxonomy_nodes;
      const newParent = it.parent_id === null ? null : Number(parseId(it.parent_id));
      if (newParent === node.parent_id) continue;
      const parent = await this.parentFor(it.parent_id, node.type);
      if (parent && parent.path.startsWith(node.path)) {
        throw new ApiException('VALIDATION_FAILED', {
          fields: { parent_id: 'cannot move under itself' },
        });
      }
      const inSubtree = await this.prisma.question_tags.count({ where: { node_id: node.id } });
      if (inSubtree > 0)
        throw new ApiException('IN_USE', { node_id: String(node.id), questions: inSubtree });
      await this.slugFree(parent?.id ?? null, node.slug, node.id);
      moves.push({ node, parent });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await tx.taxonomy_nodes.update({
          where: { id: Number(it.id) },
          data: { sort_order: it.sort_order },
        });
      }
      for (const { node, parent } of moves) {
        const newPath = `${parent?.path ?? '/'}${node.id}/`;
        const delta = (parent ? parent.depth + 1 : 0) - node.depth;
        await tx.$executeRaw(Prisma.sql`
          UPDATE taxonomy_nodes
          SET path = CONCAT(${newPath}, SUBSTRING(path, ${node.path.length + 1})), depth = depth + ${delta}
          WHERE path LIKE CONCAT(${node.path}, '%')`);
        await tx.taxonomy_nodes.update({
          where: { id: node.id },
          data: { parent_id: parent?.id ?? null },
        });
      }
    });
    await this.audit.record(actor, {
      action: 'taxonomy.reorder',
      entityType: 'taxonomy',
      entityId: `reorder:${items.length}`,
      after: { items, moved: moves.map((m) => String(m.node.id)) },
    });
  }
}
