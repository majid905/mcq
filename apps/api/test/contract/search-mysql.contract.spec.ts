import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './harness';
import { defineSearchTests } from './search-suite';

// No Meilisearch configured: the MySQL LIKE fallback must give the same answers.
describe('contract + integration: search (MySQL fallback driver)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.MEILI_URL;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  defineSearchTests({
    app: () => app,
    makeSearchable: () => Promise.resolve(), // MySQL sees rows immediately
  });
});
