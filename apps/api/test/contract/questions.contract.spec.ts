import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

describe('contract + integration: taxonomy, questions, bookmarks, wrong list, reports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const phones: string[] = [];
  const questionIds: bigint[] = [];
  const examIds: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async (): Promise<Session> => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(app, phone);
  };

  const mkQuestion = async (extra: { slug?: string; premium?: boolean; node?: number } = {}) => {
    const hash = randomBytes(32).toString('hex');
    const q = await prisma.questions.create({
      data: {
        body: `<p>প্রশ্ন ${hash.slice(0, 6)}</p>`,
        body_text: `প্রশ্ন ${hash.slice(0, 6)}`,
        options: [
          { key: 'a', html: 'ক' },
          { key: 'b', html: 'খ' },
          { key: 'c', html: 'গ' },
          { key: 'd', html: 'ঘ' },
        ],
        correct_option: 'b',
        explanation: 'ব্যাখ্যা',
        status: 'published',
        primary_node_id: extra.node ?? 12,
        content_hash: hash,
        slug: extra.slug ?? null,
        is_premium: extra.premium ?? false,
        times_answered: 10,
        times_correct: 7,
      },
    });
    questionIds.push(q.id);
    return q;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await app.get(RateLimitService).reset('');
    const keys = await redis.client.keys('otp:*');
    if (keys.length > 0) await redis.client.del(...keys);
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.questions.deleteMany({ where: { id: { in: questionIds } } }); // cascades bookmarks, reports
    await prisma.user_topic_stats.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await redis.client.del(...userIds.map((id) => `user:${id}:sub`));
    await app.close();
  });

  describe('GET /taxonomy and /source-exams', () => {
    it('is public: root categories without progress', async () => {
      const res = await http().get('/v1/taxonomy');
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
      expect(res.body.data[0]).toMatchObject({ parent_id: null, type: 'category', progress: null });
      expect(res.body.data.every((n: { has_children: boolean }) => n.has_children)).toBe(true);
    });

    it('lists children of a node, and a bad token is ignored on public routes', async () => {
      const root = (await http().get('/v1/taxonomy')).body.data[0];
      const res = await http()
        .get(`/v1/taxonomy?parent_id=${root.id}`)
        .set('Authorization', 'Bearer not-a-token');
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((n: { parent_id: string }) => n.parent_id === root.id)).toBe(true);
      expect(res.body.data[0].progress).toBeNull();
    });

    it('adds progress over the whole subtree for a signed-in user (FR-PRAC-01)', async () => {
      const s = await newUser();
      const topic = await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: 12 } });
      const cat = Number(topic.path.split('/')[1]);
      await prisma.user_topic_stats.create({
        data: { user_id: BigInt(s.user.id), node_id: 12, attempted: 40, correct: 30 },
      });
      const res = await http().get('/v1/taxonomy').set(bearer(s.access_token));
      expectContract(res);
      const mine = res.body.data.find((n: { id: string }) => n.id === String(cat));
      expect(mine.progress).toEqual({ attempted: 40, accuracy_pct: 75 });
      const other = res.body.data.find((n: { id: string }) => n.id !== String(cat));
      expect(other.progress).toEqual({ attempted: 0, accuracy_pct: 0 });
    });

    it('lists source exams with question counts', async () => {
      const res = await http().get('/v1/source-exams');
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toMatchObject({ year: expect.any(Number) });
      const filtered = await http().get('/v1/source-exams?category_id=1');
      expect(filtered.body.data.length).toBeGreaterThan(0);
      const none = await http().get('/v1/source-exams?category_id=999999');
      expect(none.body.data).toEqual([]);
    });
  });

  describe('GET /questions/{id} and the answer lock', () => {
    it('needs a token and returns the full question with the answer', async () => {
      const q = await mkQuestion();
      expect((await http().get(`/v1/questions/${q.id}`)).status).toBe(401);
      const s = await newUser();
      const res = await http().get(`/v1/questions/${q.id}`).set(bearer(s.access_token));
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: String(q.id),
        correct_option: 'b',
        explanation: 'ব্যাখ্যা',
        answer_locked: false,
        is_bookmarked: false,
        stats: { correct_pct: 70 },
      });
      expect(res.body.data.topic).toMatchObject({ id: '12' });
    });

    it('404 for unknown, unpublished and malformed ids', async () => {
      const s = await newUser();
      const draft = await mkQuestion();
      await prisma.questions.update({ where: { id: draft.id }, data: { status: 'draft' } });
      for (const id of [draft.id, '99999999', 'abc']) {
        expect((await http().get(`/v1/questions/${id}`).set(bearer(s.access_token))).status).toBe(
          404,
        );
      }
    });

    it('hides the answer of a premium question until the user has a subscription', async () => {
      const q = await mkQuestion({ premium: true });
      const s = await newUser();
      const locked = await http().get(`/v1/questions/${q.id}`).set(bearer(s.access_token));
      expectContract(locked);
      expect(locked.body.data).toMatchObject({
        answer_locked: true,
        correct_option: null,
        explanation: null,
      });
      await prisma.subscriptions.create({
        data: {
          user_id: BigInt(s.user.id),
          source: 'manual',
          starts_at: new Date(Date.now() - 3600_000),
          ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      await redis.client.del(`user:${s.user.id}:sub`);
      const open = await http().get(`/v1/questions/${q.id}`).set(bearer(s.access_token));
      expect(open.body.data).toMatchObject({ answer_locked: false, correct_option: 'b' });
      await prisma.subscriptions.deleteMany({ where: { user_id: BigInt(s.user.id) } });
    });

    it('never leaks the answer of a question in a live exam that has not ended', async () => {
      const q = await mkQuestion();
      const now = Date.now();
      const exam = await prisma.exams.create({
        data: {
          type: 'live',
          category_id: 5,
          title_bn: 'লক',
          title_en: 'lock',
          slug: `lock-${now}`,
          start_at: new Date(now - 60_000),
          end_at: new Date(now + 3600_000),
          duration_sec: 1800,
          question_count: 1,
          total_marks: 1,
          is_premium: false,
          status: 'running',
        },
      });
      examIds.push(exam.id);
      await prisma.exam_questions.create({
        data: { exam_id: exam.id, question_id: q.id, position: 1 },
      });
      const s = await newUser();
      const res = await http().get(`/v1/questions/${q.id}`).set(bearer(s.access_token));
      expect(res.body.data).toMatchObject({ answer_locked: true, correct_option: null });
      expect(JSON.stringify(res.body)).not.toContain('ব্যাখ্যা');

      await prisma.exams.update({
        where: { id: exam.id },
        data: { end_at: new Date(Date.now() - 1000), status: 'ended' },
      });
      const after = await http().get(`/v1/questions/${q.id}`).set(bearer(s.access_token));
      expect(after.body.data).toMatchObject({ answer_locked: false, correct_option: 'b' });
    });
  });

  describe('GET /public/questions/{slug}', () => {
    it('works without a token and with the same locking', async () => {
      const slug = `slug-${randomBytes(4).toString('hex')}`;
      const free = await mkQuestion({ slug });
      const res = await http().get(`/v1/public/questions/${slug}`);
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: String(free.id), correct_option: 'b' });

      const premSlug = `slug-${randomBytes(4).toString('hex')}`;
      await mkQuestion({ slug: premSlug, premium: true });
      const prem = await http().get(`/v1/public/questions/${premSlug}`);
      expect(prem.body.data).toMatchObject({ answer_locked: true, correct_option: null });

      expect((await http().get('/v1/public/questions/does-not-exist')).status).toBe(404);
    });
  });

  describe('bookmarks (FR-PRAC)', () => {
    it('PUT/DELETE are idempotent, the list is newest first and paged, is_bookmarked is set', async () => {
      const s = await newUser();
      const qs = [await mkQuestion(), await mkQuestion(), await mkQuestion()];
      for (const q of qs) {
        await http().put(`/v1/bookmarks/${q.id}`).set(bearer(s.access_token)).expect(204);
        await new Promise((r) => setTimeout(r, 15));
      }
      await http().put(`/v1/bookmarks/${qs[0]?.id}`).set(bearer(s.access_token)).expect(204);

      const p1 = await http().get('/v1/bookmarks?limit=2').set(bearer(s.access_token));
      expectContract(p1);
      expect(p1.body.data.map((q: { id: string }) => q.id)).toEqual([
        String(qs[2]?.id),
        String(qs[1]?.id),
      ]);
      expect(p1.body.data[0].is_bookmarked).toBe(true);
      expect(p1.body.meta.has_more).toBe(true);
      const p2 = await http()
        .get(`/v1/bookmarks?limit=2&cursor=${p1.body.meta.next_cursor}`)
        .set(bearer(s.access_token));
      expectContract(p2);
      expect(p2.body.data.map((q: { id: string }) => q.id)).toEqual([String(qs[0]?.id)]);
      expect(p2.body.meta.has_more).toBe(false);

      await http().delete(`/v1/bookmarks/${qs[2]?.id}`).set(bearer(s.access_token)).expect(204);
      await http().delete(`/v1/bookmarks/${qs[2]?.id}`).set(bearer(s.access_token)).expect(204);
      const after = await http().get('/v1/bookmarks').set(bearer(s.access_token));
      expect(after.body.data).toHaveLength(2);
      const single = await http().get(`/v1/questions/${qs[2]?.id}`).set(bearer(s.access_token));
      expect(single.body.data.is_bookmarked).toBe(false);
    });

    it('404 when bookmarking a question that does not exist; bad cursor is 400', async () => {
      const s = await newUser();
      expect((await http().put('/v1/bookmarks/99999999').set(bearer(s.access_token))).status).toBe(
        404,
      );
      expect(
        (await http().get('/v1/bookmarks?cursor=zzz').set(bearer(s.access_token))).status,
      ).toBe(400);
    });
  });

  describe('GET /wrong-questions (FR-PRAC-05)', () => {
    it('lists wrongly answered questions newest first', async () => {
      const s = await newUser();
      const a = await mkQuestion();
      const b = await mkQuestion();
      const uid = BigInt(s.user.id);
      await prisma.user_wrong_questions.createMany({
        data: [
          { user_id: uid, question_id: a.id, last_wrong_at: new Date(Date.now() - 5000) },
          { user_id: uid, question_id: b.id, last_wrong_at: new Date(Date.now() - 1000) },
        ],
      });
      const res = await http().get('/v1/wrong-questions').set(bearer(s.access_token));
      expectContract(res);
      expect(res.body.data.map((q: { id: string }) => q.id)).toEqual([String(b.id), String(a.id)]);
      await prisma.user_wrong_questions.deleteMany({ where: { user_id: uid } });
    });
  });

  describe('POST /questions/{id}/reports (FR-REP-01)', () => {
    it('201, then 409 for the same reason, but a different reason is fine', async () => {
      const s = await newUser();
      const q = await mkQuestion();
      const send = (reason: string, message?: string) =>
        http()
          .post(`/v1/questions/${q.id}/reports`)
          .set(bearer(s.access_token))
          .send({ reason, ...(message ? { message } : {}) });
      const first = await send('wrong_answer', 'উত্তর ভুল');
      expectContract(first);
      expect(first.status).toBe(201);
      const again = await send('wrong_answer');
      expectContract(again);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_REPORTED');
      expect((await send('typo')).status).toBe(201);
      expect(
        await prisma.question_reports.count({ where: { question_id: q.id, status: 'open' } }),
      ).toBe(2);
    });

    it('validates the reason and the question', async () => {
      const s = await newUser();
      const q = await mkQuestion();
      const bad = await http()
        .post(`/v1/questions/${q.id}/reports`)
        .set(bearer(s.access_token))
        .send({ reason: 'spam' });
      expect(bad.status).toBe(400);
      const missing = await http()
        .post('/v1/questions/99999999/reports')
        .set(bearer(s.access_token))
        .send({ reason: 'typo' });
      expect(missing.status).toBe(404);
    });
  });
});
