import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';

export const QUESTIONS_INDEX = 'questions';

export interface MeiliHit {
  id: string;
  body_text: string;
  _formatted?: { body_text?: string };
}

export interface MeiliSearchResult {
  hits: MeiliHit[];
  estimatedTotalHits?: number;
  totalHits?: number;
  processingTimeMs: number;
}

/** Index settings (docs/02 section 7). Meilisearch's tokenizer handles Bengali natively. */
export const QUESTIONS_SETTINGS = {
  searchableAttributes: ['body_text', 'options_text', 'explanation_text'],
  filterableAttributes: ['category_id', 'node_ids', 'year', 'status'],
  sortableAttributes: [],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
  pagination: { maxTotalHits: 1000 },
} as const;

/** Minimal Meilisearch HTTP client (no SDK): only the calls the app needs. */
@Injectable()
export class MeiliClient {
  private readonly logger = new Logger(MeiliClient.name);
  private readonly url: string | undefined;
  private readonly key: string | undefined;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.url = config.MEILI_URL?.replace(/\/$/, '');
    this.key = config.MEILI_MASTER_KEY;
  }

  get enabled(): boolean {
    return this.url !== undefined;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.url) throw new Error('Meilisearch is not configured');
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new Error(`Meilisearch ${method} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Creates the index when missing and applies the settings. */
  async ensureIndex(): Promise<void> {
    try {
      await this.call('POST', '/indexes', { uid: QUESTIONS_INDEX, primaryKey: 'id' });
    } catch (err) {
      if (!String((err as Error).message).includes('index_already_exists')) throw err;
    }
    await this.call('PATCH', `/indexes/${QUESTIONS_INDEX}/settings`, QUESTIONS_SETTINGS);
  }

  async addDocuments(docs: object[]): Promise<number> {
    const task = await this.call<{ taskUid: number }>(
      'POST',
      `/indexes/${QUESTIONS_INDEX}/documents`,
      docs,
    );
    return task.taskUid;
  }

  async deleteDocuments(ids: string[]): Promise<number> {
    const task = await this.call<{ taskUid: number }>(
      'POST',
      `/indexes/${QUESTIONS_INDEX}/documents/delete-batch`,
      ids,
    );
    return task.taskUid;
  }

  async deleteAll(): Promise<number> {
    const task = await this.call<{ taskUid: number }>(
      'DELETE',
      `/indexes/${QUESTIONS_INDEX}/documents`,
    );
    return task.taskUid;
  }

  /** Waits for an indexing task to finish (used by the reindex command and tests). */
  async waitFor(taskUid: number, timeoutMs = 60_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const t = await this.call<{ status: string; error?: { message: string } }>(
        'GET',
        `/tasks/${taskUid}`,
      );
      if (t.status === 'succeeded') return;
      if (t.status === 'failed' || t.status === 'canceled') {
        throw new Error(`Meilisearch task ${taskUid} ${t.status}: ${t.error?.message ?? ''}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Meilisearch task ${taskUid} did not finish in ${timeoutMs} ms`);
  }

  async search(params: {
    q: string;
    filter: string[];
    limit: number;
    offset: number;
    pre: string;
    post: string;
  }): Promise<MeiliSearchResult> {
    return this.call<MeiliSearchResult>('POST', `/indexes/${QUESTIONS_INDEX}/search`, {
      q: params.q,
      filter: params.filter,
      limit: params.limit,
      offset: params.offset,
      attributesToRetrieve: ['id'],
      attributesToHighlight: ['body_text'],
      attributesToCrop: ['body_text'],
      cropLength: 40,
      highlightPreTag: params.pre,
      highlightPostTag: params.post,
      showRankingScore: false,
    });
  }

  async stats(): Promise<{ numberOfDocuments: number }> {
    return this.call('GET', `/indexes/${QUESTIONS_INDEX}/stats`);
  }

  warn(msg: string): void {
    this.logger.warn(msg);
  }
}
