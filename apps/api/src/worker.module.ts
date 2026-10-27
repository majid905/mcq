import { Module } from '@nestjs/common';
import { ScoringWorkerModule } from './attempts/attempts.module';
import { ImportsWorkerModule } from './admin/imports/imports-worker.module';
import { StorageModule } from './storage/storage.module';
import { CoreModule } from './core.module';
import { SearchWorkerModule } from './search/search.module';
import { StatsWorkerModule } from './stats/stats.module';

/** Stream consumers and queue processors (scoring, learning stats; search sync and notifications later). */
@Module({
  imports: [
    CoreModule,
    StorageModule,
    ScoringWorkerModule,
    StatsWorkerModule,
    SearchWorkerModule,
    ImportsWorkerModule,
  ],
})
export class WorkerModule {}
