import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service';
import { IMPORT_GROUP, IMPORT_STREAM, ImportsService } from './imports.service';

type StreamEntry = [id: string, fields: string[]];
const RECLAIM_IDLE_MS = 10 * 60_000; // an import can legitimately take minutes

/**
 * Worker-side consumer of `q:import`. One job at a time per worker (COUNT 1): imports are heavy and
 * should not compete with each other. A crashed worker's job is picked up again after the idle time;
 * validating and importing are both safe to repeat (duplicates are skipped by content hash).
 */
@Injectable()
export class ImportsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsConsumer.name);
  private readonly name = `i-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
  private blocking: Redis | undefined;
  private running = false;
  private loop: Promise<void> | undefined;
  private lastReclaim = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly imports: ImportsService,
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
      await this.redis.client.xgroup('CREATE', IMPORT_STREAM, IMPORT_GROUP, '0', 'MKSTREAM');
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
        this.logger.error(`import loop failed: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  /** One read + process + ack cycle; returns how many entries were handled. Exposed for tests. */
  async runOnce(conn: Redis | undefined = this.redis.client, blockMs = 0): Promise<number> {
    let entries = await this.reclaim();
    if (entries.length === 0) {
      const c = conn ?? this.redis.client;
      const args: (string | number)[] = ['GROUP', IMPORT_GROUP, this.name, 'COUNT', 1];
      if (blockMs > 0) args.push('BLOCK', blockMs);
      args.push('STREAMS', IMPORT_STREAM, '>');
      const res = (await (
        c.xreadgroup as unknown as (...a: (string | number)[]) => Promise<unknown>
      )(...args)) as [string, StreamEntry[]][] | null;
      entries = res?.[0]?.[1] ?? [];
    }
    for (const [id, fields] of entries) {
      const f: Record<string, string> = {};
      for (let i = 0; i + 1 < fields.length; i += 2)
        f[fields[i] as string] = fields[i + 1] as string;
      if (/^\d+$/.test(f['job_id'] ?? '') && (f['phase'] === 'validate' || f['phase'] === 'run')) {
        await this.imports.process(BigInt(f['job_id'] as string), f['phase']);
      }
      await this.redis.client.xack(IMPORT_STREAM, IMPORT_GROUP, id);
      await this.redis.client.xdel(IMPORT_STREAM, id);
    }
    return entries.length;
  }

  private async reclaim(): Promise<StreamEntry[]> {
    if (Date.now() - this.lastReclaim < 30_000) return [];
    this.lastReclaim = Date.now();
    const res = (await this.redis.client.xautoclaim(
      IMPORT_STREAM,
      IMPORT_GROUP,
      this.name,
      RECLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      1,
    )) as [string, StreamEntry[], string[]?];
    return res[1] ?? [];
  }
}
