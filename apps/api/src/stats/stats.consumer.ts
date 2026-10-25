import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  STATS_GROUP,
  STATS_STREAM,
  StatsService,
  type AnsweredQuestion,
  type StatEvent,
} from './stats.service';

const BATCH = 200;
const RECLAIM_IDLE_MS = 30_000;

type StreamEntry = [id: string, fields: string[]];

const toMap = (fields: string[]): Record<string, string> => {
  const f: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) f[fields[i] as string] = fields[i + 1] as string;
  return f;
};

/**
 * Consumer group over `q:stats`. Two kinds of entries:
 *  - attempt events (no `type`): a scored attempt; its saved answers are turned into stats
 *  - `type=answer`: one quick-practice answer
 * Entries are acknowledged only after the rollups are committed.
 */
@Injectable()
export class StatsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsConsumer.name);
  private readonly name = `s-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
  private blocking: Redis | undefined;
  private running = false;
  private loop: Promise<void> | undefined;
  private lastReclaim = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureGroup();
    this.running = true;
    this.blocking = this.redis.client.duplicate();
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    this.blocking?.disconnect();
    await this.loop?.catch(() => undefined);
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.client.xgroup('CREATE', STATS_STREAM, STATS_GROUP, '0', 'MKSTREAM');
    } catch (err) {
      if (!String((err as Error).message).includes('BUSYGROUP')) throw err;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.runOnce(this.blocking, 2000);
      } catch (err) {
        if (!this.running) break;
        this.logger.error(`stats loop failed: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  /** One read + apply + ack cycle; returns how many entries were handled. Exposed for tests. */
  async runOnce(conn: Redis | undefined = this.redis.client, blockMs = 0): Promise<number> {
    let entries = await this.reclaim();
    if (entries.length === 0) {
      const c = conn ?? this.redis.client;
      const res = (
        blockMs > 0
          ? await c.xreadgroup(
              'GROUP',
              STATS_GROUP,
              this.name,
              'COUNT',
              BATCH,
              'BLOCK',
              blockMs,
              'STREAMS',
              STATS_STREAM,
              '>',
            )
          : await c.xreadgroup(
              'GROUP',
              STATS_GROUP,
              this.name,
              'COUNT',
              BATCH,
              'STREAMS',
              STATS_STREAM,
              '>',
            )
      ) as [string, StreamEntry[]][] | null;
      entries = res?.[0]?.[1] ?? [];
    }
    if (entries.length === 0) return 0;

    const { events, done } = await this.resolve(entries);
    await this.stats.apply(events);
    // Dedupe marks go in only after the commit, so a crash in between re-counts at worst once.
    const pipe = this.redis.client.pipeline();
    for (const key of done.keys) pipe.set(key, '1', 'EX', 7 * 86_400);
    await pipe.exec();
    const ids = entries.map(([id]) => id);
    await this.redis.client.xack(STATS_STREAM, STATS_GROUP, ...ids);
    await this.redis.client.xdel(STATS_STREAM, ...ids);
    return entries.length;
  }

  private async resolve(entries: StreamEntry[]) {
    const events: StatEvent[] = [];
    const done = { keys: [] as string[] };
    const attemptRefs: { attemptId: bigint; userId: bigint; at: number }[] = [];
    const quick: { userId: bigint; questionId: bigint; correct: boolean; at: number }[] = [];

    for (const [, fields] of entries) {
      const f = toMap(fields);
      if (!/^\d+$/.test(f.user_id ?? '')) continue; // malformed entry: dropped (and acked)
      const userId = BigInt(f.user_id as string);
      const at = Number(f.at) || Date.now();
      if (f.type === 'answer') {
        if (/^\d+$/.test(f.question_id ?? '')) {
          quick.push({
            userId,
            questionId: BigInt(f.question_id as string),
            correct: f.correct === '1',
            at,
          });
        }
      } else if (/^\d+$/.test(f.attempt_id ?? '')) {
        const attemptId = BigInt(f.attempt_id as string);
        if (await this.redis.client.exists(`stats:done:${attemptId}`)) continue; // redelivery
        attemptRefs.push({ attemptId, userId, at });
        done.keys.push(`stats:done:${attemptId}`);
      }
    }

    // Quick answers -> topic of each question.
    const quickIds = [...new Set(quick.map((q) => q.questionId))];
    const nodes = await this.nodesOf(quickIds);
    for (const q of quick) {
      const nodeId = nodes.get(q.questionId);
      if (nodeId === undefined) continue;
      events.push({
        userId: q.userId,
        at: q.at,
        exam: false,
        answers: [{ questionId: q.questionId, nodeId, correct: q.correct }],
      });
    }

    // Finished attempts -> their saved answers, checked against the questions' correct option.
    for (const ref of attemptRefs) {
      const row = await this.prisma.attempts.findFirst({
        where: { id: ref.attemptId, user_id: ref.userId },
        select: { answers: true, kind: true },
      });
      const given =
        row?.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
          ? (row.answers as Record<string, string>)
          : {};
      const ids = Object.keys(given)
        .filter((k) => /^\d+$/.test(k))
        .map((k) => BigInt(k));
      if (ids.length === 0) continue;
      const rows = await this.prisma.questions.findMany({
        where: { id: { in: ids } },
        select: { id: true, primary_node_id: true, correct_option: true },
      });
      const answers: AnsweredQuestion[] = rows.map((q) => ({
        questionId: q.id,
        nodeId: q.primary_node_id,
        correct: given[String(q.id)] === q.correct_option,
      }));
      events.push({
        userId: ref.userId,
        at: ref.at,
        exam: row?.kind === 'live' || row?.kind === 'custom' || row?.kind === 'model',
        answers,
      });
    }
    return { events, done };
  }

  private async nodesOf(ids: bigint[]): Promise<Map<bigint, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.questions.findMany({
      where: { id: { in: ids } },
      select: { id: true, primary_node_id: true },
    });
    return new Map(rows.map((r) => [r.id, r.primary_node_id]));
  }

  private async reclaim(): Promise<StreamEntry[]> {
    if (Date.now() - this.lastReclaim < 10_000) return [];
    this.lastReclaim = Date.now();
    const res = (await this.redis.client.xautoclaim(
      STATS_STREAM,
      STATS_GROUP,
      this.name,
      RECLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      BATCH,
    )) as [string, StreamEntry[], string[]?];
    return res[1] ?? [];
  }
}
