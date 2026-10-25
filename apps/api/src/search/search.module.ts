import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { QuestionsModule } from '../questions/questions.module';
import { MeiliClient } from './meili.client';
import { SearchController } from './search.controller';
import { SearchIndexer } from './search-indexer';
import { SearchService } from './search.service';
import { SearchSyncConsumer } from './search-sync.consumer';

@Module({
  imports: [AuthModule, ExamsModule, QuestionsModule],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexer, MeiliClient],
  exports: [SearchIndexer, MeiliClient],
})
export class SearchModule {}

/** Pulled in by the worker process: starts the outbox sync loop. */
@Module({
  providers: [SearchIndexer, MeiliClient, SearchSyncConsumer],
  exports: [SearchIndexer, MeiliClient],
})
export class SearchWorkerModule {}
