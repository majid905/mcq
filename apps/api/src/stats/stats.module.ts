import { Module } from '@nestjs/common';
import { StatsConsumer } from './stats.consumer';
import { StatsService } from './stats.service';

/** Pulled in by the worker process: starts the `q:stats` consumer. */
@Module({ providers: [StatsService, StatsConsumer], exports: [StatsService, StatsConsumer] })
export class StatsWorkerModule {}
