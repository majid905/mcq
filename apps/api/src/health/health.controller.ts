import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { SkipGate } from '../gate/skip-gate.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type Check = 'up' | 'down';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  checks: { database: Check; redis: Check };
  server_time: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** GET /v1/health: 200 when MySQL and Redis answer, 503 (same body shape) otherwise. */
  @Public()
  @SkipGate()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        (): Check => 'up',
        (): Check => 'down',
      ),
      this.redis.client.ping().then(
        (): Check => 'up',
        (): Check => 'down',
      ),
    ]);
    const ok = database === 'up' && redis === 'up';
    if (!ok) res.status(503);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { database, redis },
      server_time: new Date().toISOString(),
    };
  }
}
