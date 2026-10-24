import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ApiException } from './api-exception';

export interface HitResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

/** Fixed-window counters in Redis (docs/04-API.md section 5). Keys are `rl:<name>`. */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** INCR + EXPIRE NX in one MULTI, so a crash can never leave a counter without a TTL. */
  async hit(key: string, limit: number, windowSec: number): Promise<HitResult> {
    const k = `rl:${key}`;
    const res = await this.redis.client.multi().incr(k).expire(k, windowSec, 'NX').ttl(k).exec();
    const count = Number(res?.[0]?.[1] ?? 1);
    const ttl = Number(res?.[2]?.[1] ?? windowSec);
    return { allowed: count <= limit, count, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }

  /** Throws 429 RATE_LIMITED (with Retry-After) when the window is exhausted. */
  async assert(key: string, limit: number, windowSec: number): Promise<void> {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) throw new ApiException('RATE_LIMITED', { retry_after_sec: r.retryAfterSec });
  }

  /** Test helper and admin tool: drop counters matching a prefix. */
  async reset(prefix: string): Promise<void> {
    const keys = await this.redis.client.keys(`rl:${prefix}*`);
    if (keys.length > 0) await this.redis.client.del(...keys);
  }
}
