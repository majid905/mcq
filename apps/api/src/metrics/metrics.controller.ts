import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ApiException } from '../common/api-exception';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { SkipGate } from '../gate/skip-gate.decorator';
import { MetricsService } from './metrics.service';

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Scraped by Prometheus on the private network. Lives at `/metrics`, outside `/v1`: nginx only proxies
 * `/v1`, `/docs` and `/openapi.json`, so it is not reachable from the internet. `METRICS_TOKEN` adds a
 * bearer check for setups where the port is exposed.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @SkipGate()
  @Get()
  async scrape(
    @Headers('authorization') auth: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const token = this.config.METRICS_TOKEN;
    if (token && !same(auth ?? '', `Bearer ${token}`)) throw new ApiException('UNAUTHENTICATED');
    // Raw text: the JSON envelope interceptor must not wrap it.
    res.type('text/plain; version=0.0.4; charset=utf-8').send(await this.metrics.render());
  }
}
