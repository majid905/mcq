import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { SUBMIT_STREAM } from './attempt-state';
import { parseSubmit, SCORING_GROUP, ScoringService, type SubmitMessage } from './scoring.service';

const BATCH = 500;
/** An entry nobody acknowledged for this long is taken over (a crashed worker, or a DB outage). */
const RECLAIM_IDLE_MS = 30_000;

type StreamEntry = [id: string, fields: string[]];

/**
 * Stream consumer group over `q:submit`. Runs in the worker process; several workers can run
 * side by side, Redis hands each entry to exactly one of them. Entries are acknowledged only after
 * MySQL has committed (docs/02 "Redis queue durability").
 */
@Injectable()
export class ScoringConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScoringConsumer.name);
  private readonly name = `w-${process.pid}-${Math.random().toString(36).slice(2, 6)}`;
  private blocking: Redis | undefined;
  private running = false;
  private loop: Promise<void> | undefined;
  private lastReclaim = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly scoring: ScoringService,
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
      await this.redis.client.xgroup('CREATE', SUBMIT_STREAM, SCORING_GROUP, '0', 'MKSTREAM');
    } catch (err) {
      if (!String((err as Error).message).includes('BUSYGROUP')) throw err;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const n = await this.runOnce(this.blocking, 2000);
        if (n === 0 && !this.running) break;
      } catch (err) {
        if (!this.running) break;
        this.logger.error(`scoring loop failed: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  /** One read + score + ack cycle. Returns how many entries were handled. Exposed for tests. */
  async runOnce(conn: Redis | undefined = this.redis.client, blockMs = 0): Promise<number> {
    let entries = await this.reclaim();
    if (entries.length === 0) {
      const c = conn ?? this.redis.client;
      // ioredis types BLOCK and the plain form as separate overloads.
      const res = (
        blockMs > 0
          ? await c.xreadgroup(
              'GROUP',
              SCORING_GROUP,
              this.name,
              'COUNT',
              BATCH,
              'BLOCK',
              blockMs,
              'STREAMS',
              SUBMIT_STREAM,
              '>',
            )
          : await c.xreadgroup(
              'GROUP',
              SCORING_GROUP,
              this.name,
              'COUNT',
              BATCH,
              'STREAMS',
              SUBMIT_STREAM,
              '>',
            )
      ) as [string, StreamEntry[]][] | null;
      entries = res?.[0]?.[1] ?? [];
    }
    if (entries.length === 0) return 0;

    const valid: SubmitMessage[] = [];
    const poison: string[] = [];
    for (const [id, fields] of entries) {
      const msg = parseSubmit(id, fields);
      if (msg) valid.push(msg);
      else poison.push(id);
    }
    if (poison.length > 0) {
      this.logger.error(`dropping ${poison.length} malformed submit entries: ${poison.join(',')}`);
    }
    const ok = [...poison, ...(await this.scoring.processBatch(valid))];
    if (ok.length > 0) {
      await this.redis.client.xack(SUBMIT_STREAM, SCORING_GROUP, ...ok);
      await this.redis.client.xdel(SUBMIT_STREAM, ...ok);
    }
    return entries.length;
  }

  /** Takes over entries another consumer left unacknowledged. Checked every 10 s. */
  private async reclaim(): Promise<StreamEntry[]> {
    if (Date.now() - this.lastReclaim < 10_000) return [];
    this.lastReclaim = Date.now();
    const res = (await this.redis.client.xautoclaim(
      SUBMIT_STREAM,
      SCORING_GROUP,
      this.name,
      RECLAIM_IDLE_MS,
      '0-0',
      'COUNT',
      BATCH,
    )) as [string, StreamEntry[], string[]?];
    return res[1] ?? [];
  }
}
