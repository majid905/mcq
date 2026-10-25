import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MeiliClient } from '../../src/search/meili.client';
import { SearchIndexer } from '../../src/search/search-indexer';
import { createTestApp } from './harness';
import { bearer, randomPhone, registerUser } from './helpers';
import { defineSearchTests } from './search-suite';

// Runs only where a Meilisearch is available (local docker compose, and CI's service container).
const enabled = Boolean(process.env.MEILI_URL);
const maybe = enabled ? describe : describe.skip;

maybe('contract + integration: search (Meilisearch driver)', () => {
  let app: INestApplication;
  let indexer: SearchIndexer;
  let prisma: PrismaService;
  const createdIds: bigint[] = [];

  /** The path production uses: outbox rows, then the worker loop's sync. */
  const viaOutbox = async (ids: bigint[]) => {
    await prisma.search_outbox.createMany({
      data: ids.map((question_id) => ({ question_id, action: 'upsert' as const })),
    });
    while ((await indexer.syncOutbox()) > 0) {
      /* drain */
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    indexer = app.get(SearchIndexer);
    await indexer.reindexAll(); // also creates the index with its settings
  }, 120_000);

  afterAll(async () => {
    const meili = app.get(MeiliClient);
    if (createdIds.length > 0) {
      await meili
        .waitFor(await meili.deleteDocuments(createdIds.map(String)))
        .catch(() => undefined);
    }
    await app.close();
  });

  defineSearchTests({
    app: () => app,
    makeSearchable: async (ids) => {
      createdIds.push(...ids);
      await viaOutbox(ids);
    },
  });

  describe('index maintenance', () => {
    it('removes archived questions on the next sync and tolerates typos', async () => {
      const word = `zq${randomBytes(4).toString('hex')}`;
      const hash = randomBytes(32).toString('hex');
      const q = await prisma.questions.create({
        data: {
          body: `<p>${word} পরীক্ষামূলক প্রশ্ন</p>`,
          body_text: `${word} পরীক্ষামূলক প্রশ্ন`,
          options: [
            { key: 'a', html: 'ক' },
            { key: 'b', html: 'খ' },
            { key: 'c', html: 'গ' },
            { key: 'd', html: 'ঘ' },
          ],
          correct_option: 'a',
          status: 'published',
          primary_node_id: 12,
          content_hash: hash,
        },
      });
      createdIds.push(q.id);
      await viaOutbox([q.id]);

      const phone = randomPhone();
      const s = await registerUser(app, phone);
      const find = async (term: string) =>
        (
          await request(app.getHttpServer())
            .get(`/v1/search/questions?q=${encodeURIComponent(term)}`)
            .set(bearer(s.access_token))
        ).body.data as { question: { id: string } }[];

      expect((await find(word)).map((h) => h.question.id)).toContain(String(q.id));
      // One wrong letter in a long word still finds it.
      const typo = `${word.slice(0, -1)}${word.endsWith('x') ? 'y' : 'x'}`;
      expect((await find(typo)).map((h) => h.question.id)).toContain(String(q.id));

      await prisma.questions.update({ where: { id: q.id }, data: { status: 'archived' } });
      await viaOutbox([q.id]);
      expect((await find(word)).map((h) => h.question.id)).not.toContain(String(q.id));

      await prisma.search_outbox.deleteMany({ where: { question_id: q.id } });
      await prisma.questions.delete({ where: { id: q.id } });
      await prisma.users.deleteMany({ where: { phone } });
    });

    it('a full reindex indexes every published question and clears the outbox', async () => {
      const published = await prisma.questions.count({ where: { status: 'published' } });
      const total = await indexer.reindexAll();
      expect(total).toBe(published);
      const stats = await app.get(MeiliClient).stats();
      expect(stats.numberOfDocuments).toBe(published);
      expect(await prisma.search_outbox.count({ where: { processed_at: null } })).toBe(0);
    }, 120_000);
  });
});
