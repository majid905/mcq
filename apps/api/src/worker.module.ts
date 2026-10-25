import { Module } from '@nestjs/common';
import { ScoringWorkerModule } from './attempts/attempts.module';
import { CoreModule } from './core.module';
import { StatsWorkerModule } from './stats/stats.module';

/** Stream consumers and queue processors (scoring, learning stats; search sync and notifications later). */
@Module({ imports: [CoreModule, ScoringWorkerModule, StatsWorkerModule] })
export class WorkerModule {}
