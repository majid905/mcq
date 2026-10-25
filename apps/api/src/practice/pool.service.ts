import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const poolKey = (nodeId: number | string) => `topic:${nodeId}:qids`;
/** Pools age out after 26 h, so every pool is rebuilt about once a night (docs/02 section 6). */
const POOL_TTL_SEC = 26 * 3600;
const BUILD_CHUNK = 5000;

/**
 * Random question selection without `ORDER BY RAND()` (docs/03 rule 4): one Redis set of the
 * published question ids per topic subtree, filled lazily and sampled with SRANDMEMBER.
 */
@Injectable()
export class PoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Up to `count` distinct random ids from the node's subtree (fewer when the pool is smaller). */
  async sample(nodeId: number, count: number): Promise<bigint[]> {
    await this.ensure(nodeId);
    const ids = await this.redis.client.srandmember(poolKey(nodeId), count);
    return (ids ?? []).map((i) => BigInt(i));
  }

  async size(nodeId: number): Promise<number> {
    await this.ensure(nodeId);
    return this.redis.client.scard(poolKey(nodeId));
  }

  async invalidate(nodeId: number): Promise<void> {
    await this.redis.client.del(poolKey(nodeId));
  }

  private async ensure(nodeId: number): Promise<void> {
    const key = poolKey(nodeId);
    if ((await this.redis.client.exists(key)) === 1) return;

    // One builder at a time; the others wait for its result instead of hammering MySQL.
    const lock = await this.redis.client.set(`${key}:building`, '1', 'EX', 120, 'NX');
    if (lock !== 'OK') {
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if ((await this.redis.client.exists(key)) === 1) return;
      }
    }
    try {
      await this.build(nodeId, key);
    } finally {
      if (lock === 'OK') await this.redis.client.del(`${key}:building`);
    }
  }

  private async build(nodeId: number, key: string): Promise<void> {
    const node = await this.prisma.taxonomy_nodes.findUnique({
      where: { id: nodeId },
      select: { path: true },
    });
    if (!node) return;
    const subtree = await this.prisma.taxonomy_nodes.findMany({
      where: { path: { startsWith: node.path }, is_active: true },
      select: { id: true },
    });
    const nodeIds = subtree.map((n) => n.id);
    // Built under a temp key and renamed, so readers never see a half-filled pool.
    const tmp = `${key}:tmp`;
    await this.redis.client.del(tmp);
    let after = 0n;
    let total = 0;
    for (;;) {
      const rows = await this.prisma.questions.findMany({
        where: { status: 'published', primary_node_id: { in: nodeIds }, id: { gt: after } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BUILD_CHUNK,
      });
      if (rows.length === 0) break;
      await this.redis.client.sadd(tmp, ...rows.map((r) => String(r.id)));
      total += rows.length;
      after = rows[rows.length - 1]?.id ?? after;
    }
    if (total === 0) {
      // Remember "empty" for a minute with a placeholder id that matches no question.
      await this.redis.client.sadd(key, '0');
      await this.redis.client.expire(key, 60);
      return;
    }
    await this.redis.client.rename(tmp, key);
    await this.redis.client.expire(key, POOL_TTL_SEC);
  }
}
