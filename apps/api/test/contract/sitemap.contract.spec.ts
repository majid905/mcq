import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';

describe('contract + integration: public sitemap data', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const stamp = Date.now().toString(36);
  const questionIds: bigint[] = [];
  const examIds: bigint[] = [];
  let topic: number;
  const http = () => request(app.getHttpServer());

  const seed = async (n: number, status: 'published' | 'draft' | 'archived', slugged: boolean) => {
    const text = `sitemap ${stamp} ${status} ${slugged} ${n}`;
    const q = await prisma.questions.create({
      data: {
        body: `<p>${text}</p>`,
        body_text: text,
        options: [],
        correct_option: 'a',
        status,
        primary_node_id: topic,
        content_hash: createHash('sha256').update(text).digest('hex'),
      },
    });
    if (slugged) {
      await prisma.questions.update({ where: { id: q.id }, data: { slug: `sm-${stamp}-${q.id}` } });
    }
    questionIds.push(q.id);
    return q.id;
  };

  beforeAll(async () => {
    process.env['SITEMAP_PAGE_SIZE'] = '3';
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await app.get(RateLimitService).reset('');
    topic = (await prisma.taxonomy_nodes.findFirstOrThrow({ where: { type: 'topic' } })).id;
    await redis.client.del('sitemap:questions:layout');
  });

  afterAll(async () => {
    await redis.client.del('sitemap:questions:layout');
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.questions.deleteMany({ where: { id: { in: questionIds } } });
    await app.close();
    delete process.env['SITEMAP_PAGE_SIZE'];
  });

  it('splits public questions into fixed-size pages that together cover each one once', async () => {
    const wanted: string[] = [];
    for (let i = 0; i < 7; i++) wanted.push(`sm-${stamp}-${await seed(i, 'published', true)}`);
    await seed(1, 'published', false); // no public page
    await seed(2, 'draft', true); // not public
    await seed(3, 'archived', true); // withdrawn
    await redis.client.del('sitemap:questions:layout');

    const index = await http().get('/v1/sitemap-does-not-exist');
    expect(index.status).toBe(404);

    const res = await http().get('/v1/public/sitemap/questions');
    expect(res.status).toBe(200);
    expectContract(res);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    const { page_size, total, pages } = res.body.data as {
      page_size: number;
      total: number;
      pages: { page: number; count: number }[];
    };
    expect(page_size).toBe(3);
    expect(total).toBeGreaterThanOrEqual(7);
    expect(pages).toHaveLength(Math.ceil(total / 3));
    expect(pages.reduce((s, p) => s + p.count, 0)).toBe(total);
    expect(pages.slice(0, -1).every((p) => p.count === 3)).toBe(true);

    const seen: string[] = [];
    for (const p of pages) {
      const page = await http().get(`/v1/public/sitemap/questions/${p.page}`);
      expect(page.status).toBe(200);
      expectContract(page);
      expect(page.headers['cache-control']).toBe('public, max-age=3600');
      expect(page.body.data).toHaveLength(p.count);
      for (const item of page.body.data as { slug: string }[]) seen.push(item.slug);
    }
    expect(new Set(seen).size).toBe(seen.length); // nothing twice
    expect(seen).toHaveLength(total);
    for (const slug of wanted) expect(seen).toContain(slug);
    expect(seen.some((s) => s.startsWith(`sm-${stamp}`) && !wanted.includes(s))).toBe(false);
  });

  it('answers 404 outside the layout and for junk page numbers', async () => {
    const layout = (await http().get('/v1/public/sitemap/questions')).body.data;
    for (const page of [0, layout.pages.length + 1, 99999]) {
      const res = await http().get(`/v1/public/sitemap/questions/${page}`);
      expect(res.status).toBe(404);
      expectContract(res);
    }
    expect((await http().get('/v1/public/sitemap/questions/abc')).status).toBe(404);
    expect((await http().get('/v1/public/sitemap/questions/-1')).status).toBe(404);
  });

  it('lists exams that are not drafts or cancelled', async () => {
    const category = await prisma.taxonomy_nodes.findFirstOrThrow({ where: { type: 'category' } });
    const make = async (status: 'draft' | 'scheduled' | 'cancelled' | 'ended') => {
      const e = await prisma.exams.create({
        data: {
          type: 'model',
          category_id: category.id,
          title_bn: `সাইটম্যাপ ${status}`,
          title_en: `sitemap ${status}`,
          slug: `sm-${stamp}-${status}`,
          duration_sec: 600,
          question_count: 1,
          total_marks: 1,
          status,
        },
      });
      examIds.push(e.id);
      return e;
    };
    const live = await make('scheduled');
    await make('ended');
    await make('draft');
    await make('cancelled');

    const res = await http().get('/v1/public/sitemap/exams');
    expect(res.status).toBe(200);
    expectContract(res);
    const slugs = (res.body.data as { slug: string }[]).map((e) => e.slug);
    expect(slugs).toEqual(expect.arrayContaining([`sm-${stamp}-scheduled`, `sm-${stamp}-ended`]));
    expect(slugs).not.toContain(`sm-${stamp}-draft`);
    expect(slugs).not.toContain(`sm-${stamp}-cancelled`);
    expect((res.body.data as { id: string }[]).some((e) => e.id === String(live.id))).toBe(true);
  });
});
