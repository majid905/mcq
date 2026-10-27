import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { IMPORT_GROUP, IMPORT_STREAM } from '../admin/imports/imports.service';
import { SUBMIT_STREAM } from '../attempts/attempt-state';
import { SCORING_GROUP } from '../attempts/scoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { STATS_GROUP, STATS_STREAM } from '../stats/stats.service';

/** Milliseconds timestamp of a stream entry id ("1730000000000-0"). */
export const idToMs = (id: string): number => Number(id.split('-')[0]);

interface GroupInfo {
  lag: number;
  pending: number;
}

/**
 * Prometheus metrics (docs/08 section 4). Request timings are recorded as they happen; queue depth,
 * scoring lag, Redis memory and database reachability are read when Prometheus scrapes.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly httpDuration: Histogram<'method' | 'route' | 'status'>;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'mcq_' });
    this.httpDuration = new Histogram({
      name: 'mcq_http_request_duration_seconds',
      help: 'API request duration by route template and status',
      labelNames: ['method', 'route', 'status'],
      // Exam-start p95 target is 0.8 s, submit 0.2 s: dense buckets around both.
      buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2, 5, 10],
      registers: [this.registry],
    });

    // `collect` runs on every scrape. The helpers are arrow functions so `this` inside `collect` is the gauge.
    const stats = () => this.queueStats();
    new Gauge({
      name: 'mcq_queue_backlog',
      help: 'Entries waiting or being processed per queue',
      labelNames: ['queue'],
      registers: [this.registry],
      async collect() {
        for (const q of await stats()) this.set({ queue: q.name }, q.backlog);
      },
    });
    new Gauge({
      name: 'mcq_queue_oldest_age_seconds',
      help: 'Age of the oldest unprocessed entry per queue (scoring lag)',
      labelNames: ['queue'],
      registers: [this.registry],
      async collect() {
        for (const q of await stats()) this.set({ queue: q.name }, q.oldestAgeSec);
      },
    });
    const memory = () => this.redisMemoryRatio();
    new Gauge({
      name: 'mcq_redis_memory_used_ratio',
      help: 'Redis used memory divided by maxmemory (0 when no limit is set)',
      registers: [this.registry],
      async collect() {
        this.set(await memory());
      },
    });
    const redisPing = () =>
      this.redis.client.ping().then(
        () => 1,
        () => 0,
      );
    new Gauge({
      name: 'mcq_redis_up',
      help: '1 when Redis answers',
      registers: [this.registry],
      async collect() {
        this.set(await redisPing());
      },
    });
    const dbPing = () =>
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 1,
        () => 0,
      );
    new Gauge({
      name: 'mcq_database_up',
      help: '1 when MySQL answers',
      registers: [this.registry],
      async collect() {
        this.set(await dbPing());
      },
    });
  }

  /** Express middleware: times every request once the response is done. */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const end = this.httpDuration.startTimer();
    res.on('finish', () => {
      // `req.route.path` is the template ("/exams/:id"), so ids never blow up the label set.
      const route = req.route
        ? `${req.baseUrl}${(req.route as { path: string }).path}`
        : 'unmatched';
      end({ method: req.method, route, status: String(res.statusCode) });
    });
    next();
  };

  private async group(stream: string, group: string): Promise<GroupInfo> {
    try {
      const info = (await this.redis.client.xinfo('GROUPS', stream)) as unknown[];
      for (const g of info) {
        const flat = g as (string | number | null)[];
        if (flat[flat.indexOf('name') + 1] === group) {
          const get = (k: string) => Number(flat[flat.indexOf(k) + 1] ?? 0) || 0;
          return { lag: get('lag'), pending: get('pending') };
        }
      }
    } catch {
      // the stream or group does not exist yet
    }
    return { lag: 0, pending: 0 };
  }

  /** Consumers delete what they finished, so the first entry of a stream is the oldest unprocessed one. */
  private async oldestAge(stream: string): Promise<number> {
    try {
      const first = (await this.redis.client.xrange(stream, '-', '+', 'COUNT', 1)) as [
        string,
        string[],
      ][];
      const id = first[0]?.[0];
      return id ? Math.max(0, (Date.now() - idToMs(id)) / 1000) : 0;
    } catch {
      return 0;
    }
  }

  private async queueStats() {
    const defs: [string, string, string][] = [
      ['submit', SUBMIT_STREAM, SCORING_GROUP],
      ['stats', STATS_STREAM, STATS_GROUP],
      ['import', IMPORT_STREAM, IMPORT_GROUP],
    ];
    return Promise.all(
      defs.map(async ([name, stream, group]) => {
        const g = await this.group(stream, group);
        return { name, backlog: g.lag + g.pending, oldestAgeSec: await this.oldestAge(stream) };
      }),
    );
  }

  private async redisMemoryRatio(): Promise<number> {
    try {
      const info = await this.redis.client.info('memory');
      const num = (k: string) => Number(new RegExp(`${k}:(\\d+)`).exec(info)?.[1] ?? 0);
      const max = num('maxmemory');
      return max > 0 ? num('used_memory') / max : 0;
    } catch {
      return 0;
    }
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
