import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadDotenv } from '../config/dotenv';
import { CoreModule } from '../core.module';
import { MeiliClient } from './meili.client';
import { SearchIndexer } from './search-indexer';
import { SearchWorkerModule } from './search.module';

@Module({ imports: [CoreModule, SearchWorkerModule] })
class ReindexModule {}

/** `pnpm --filter @mcq/api search:reindex`: rebuild the whole Meilisearch index from MySQL. */
async function main(): Promise<void> {
  loadDotenv();
  const app = await NestFactory.createApplicationContext(ReindexModule, {
    logger: ['error', 'warn'],
  });
  if (!app.get(MeiliClient).enabled) {
    console.error('MEILI_URL is not set; nothing to reindex.');
    process.exitCode = 1;
  } else {
    const total = await app
      .get(SearchIndexer)
      .reindexAll((n) => process.stdout.write(`\r${n} indexed`));
    process.stdout.write(`\ndone: ${total} questions\n`);
  }
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
