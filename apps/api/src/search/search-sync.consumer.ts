import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MeiliClient } from './meili.client';
import { SearchIndexer } from './search-indexer';

const POLL_MS = 2000;

/** Worker loop: moves `search_outbox` rows into Meilisearch. Idle (no-op) without MEILI_URL. */
@Injectable()
export class SearchSyncConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchSyncConsumer.name);
  private timer: NodeJS.Timeout | undefined;
  private busy = false;

  constructor(
    private readonly indexer: SearchIndexer,
    private readonly meili: MeiliClient,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.meili.enabled) {
      this.logger.log('MEILI_URL not set: search sync disabled (MySQL search is used)');
      return;
    }
    await this.meili
      .ensureIndex()
      .catch((e: Error) => this.logger.error(`ensureIndex: ${e.message}`));
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Keep draining while there is work.
      while ((await this.indexer.syncOutbox()) > 0) {
        /* loop */
      }
    } catch (err) {
      this.logger.error(`outbox sync failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
