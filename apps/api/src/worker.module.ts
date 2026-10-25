import { Module } from '@nestjs/common';
import { ScoringWorkerModule } from './attempts/attempts.module';
import { CoreModule } from './core.module';

/** Stream consumers and queue processors (scoring now; search sync, analytics, notifications later). */
@Module({ imports: [CoreModule, ScoringWorkerModule] })
export class WorkerModule {}
