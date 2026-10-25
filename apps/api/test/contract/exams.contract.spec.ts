import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PaperService } from '../../src/exams/paper.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser } from './helpers';

describe('contract + integration: exams list, detail, reminder, paper', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const phones: string[] = [];
  const examIds: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async () => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(app, phone);
  };

  const mkExam = async (
    slug: string,
    status: 'scheduled' | 'running' | 'ended' | 'draft',
    startMin: number,
    endMin: number,
    extra: { is_premium?: boolean; question_count?: number } = {},
  ) => {
    const now = Date.now();
    const e = await prisma.exams.create({
      data: {
        type: 'live',
        category_id: 5,
        title_bn: `পরীক্ষা ${slug}`,
        title_en: `Exam ${slug}`,
        slug: `${slug}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        start_at: new Date(now + startMin * 60_000),
        end_at: new Date(now + endMin * 60_000),
        duration_sec: 1800,
        question_count: extra.question_count ?? 3,
        total_marks: 3,
        is_premium: extra.is_premium ?? false,
        status,
      },
    });
    examIds.push(e.id);
    return e;
  };

  const attachQuestions = async (examId: bigint, n: number) => {
    const qs = await prisma.questions.findMany({
      where: { status: 'published' },
      select: { id: true },
      take: n,
      orderBy: { id: 'asc' },
    });
    await prisma.exam_questions.createMany({
      data: qs.map((q, i) => ({
        exam_id: examId,
        question_id: q.id,
        position: i + 1,
        section_node_id: null,
      })),
    });
    return qs;
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
    await prisma.attempts.deleteMany({ where: { user_id: { in: users.map((u) => u.id) } } });
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await redis.client.del(...examIds.flatMap((id) => [`exam:${id}:paper`, `exam:${id}:key`]));
    await app.close();
  });

  describe('GET /exams', () => {
    it('needs a token and a valid status', async () => {
      expect((await http().get('/v1/exams?status=running')).status).toBe(401);
      const s = await newUser();
      const bad = await http().get('/v1/exams?status=nope').set(bearer(s.access_token));
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('lists by clock-derived status and hides drafts (FR-EXAM-01)', async () => {
      const running = await mkExam('l-run', 'running', -10, 60);
      const soon = await mkExam('l-soon', 'scheduled', 5, 90);
      const later = await mkExam('l-later', 'scheduled', 600, 700);
      const done = await mkExam('l-done', 'ended', -300, -200);
      const draft = await mkExam('l-draft', 'draft', 600, 700);
      const s = await newUser();
      const get = async (qs: string) => {
        const res = await http().get(`/v1/exams?${qs}`).set(bearer(s.access_token));
        expectContract(res);
        expect(res.status).toBe(200);
        return res.body.data as { id: string; status: string }[];
      };

      const r = await get(`status=running&category_id=5&limit=100`);
      expect(r.map((e) => e.id)).toContain(String(running.id));
      expect(r.map((e) => e.id)).not.toContain(String(soon.id));

      const u = await get(`status=upcoming&category_id=5&limit=100`);
      const byId = new Map(u.map((e) => [e.id, e.status]));
      expect(byId.get(String(soon.id))).toBe('open_soon');
      expect(byId.get(String(later.id))).toBe('upcoming');
      expect(byId.has(String(draft.id))).toBe(false);

      const f = await get(`status=finished&category_id=5&limit=100`);
      expect(f.map((e) => e.id)).toContain(String(done.id));
    });

    it('upcoming pages by (start_at, id) without gaps or repeats', async () => {
      const a = await mkExam('p-a', 'scheduled', 2000, 2100);
      const b = await mkExam('p-b', 'scheduled', 2001, 2100);
      const c = await mkExam('p-c', 'scheduled', 2002, 2100);
      const s = await newUser();
      const seen: string[] = [];
      let cursor = '';
      for (let i = 0; i < 100; i++) {
        const res = await http()
          .get(`/v1/exams?status=upcoming&limit=1${cursor ? `&cursor=${cursor}` : ''}`)
          .set(bearer(s.access_token));
        expectContract(res);
        seen.push(...(res.body.data as { id: string }[]).map((e) => e.id));
        if (!res.body.meta.has_more) break;
        cursor = res.body.meta.next_cursor;
      }
      expect(new Set(seen).size).toBe(seen.length);
      const idx = [a, b, c].map((e) => seen.indexOf(String(e.id)));
      expect(idx.every((i) => i >= 0)).toBe(true);
      expect(idx).toEqual([...idx].sort((x, y) => x - y));
    });

    it('rejects a malformed cursor', async () => {
      const s = await newUser();
      const res = await http()
        .get('/v1/exams?status=upcoming&cursor=abc')
        .set(bearer(s.access_token));
      expect(res.status).toBe(400);
    });
  });

  describe('GET /exams/{id}', () => {
    it('returns detail with rules and no lock for a free exam', async () => {
      const e = await mkExam('d-free', 'scheduled', 120, 240);
      const s = await newUser();
      const res = await http().get(`/v1/exams/${e.id}`).set(bearer(s.access_token));
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data.locked_reason).toBeNull();
      expect(res.body.data.rules.length).toBeGreaterThan(0);
    });

    it('locks a premium exam for a user without a subscription (FR-EXAM-03)', async () => {
      const e = await mkExam('d-prem', 'scheduled', 120, 240, { is_premium: true });
      const s = await newUser();
      const res = await http().get(`/v1/exams/${e.id}`).set(bearer(s.access_token));
      expect(res.body.data.locked_reason).toBe('premium_required');

      await prisma.subscriptions.create({
        data: {
          user_id: BigInt(s.user.id),
          source: 'manual',
          category_ids: [5],
          starts_at: new Date(Date.now() - 3600_000),
          ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      await redis.client.del(`user:${s.user.id}:sub`);
      const after = await http().get(`/v1/exams/${e.id}`).set(bearer(s.access_token));
      expect(after.body.data.locked_reason).toBeNull();
      await prisma.subscriptions.deleteMany({ where: { user_id: BigInt(s.user.id) } });
    });

    it('404 for drafts and unknown ids', async () => {
      const d = await mkExam('d-draft', 'draft', 120, 240);
      const s = await newUser();
      expect((await http().get(`/v1/exams/${d.id}`).set(bearer(s.access_token))).status).toBe(404);
      expect((await http().get('/v1/exams/99999999').set(bearer(s.access_token))).status).toBe(404);
      expect((await http().get('/v1/exams/abc').set(bearer(s.access_token))).status).toBe(404);
    });
  });

  describe('reminder', () => {
    it('PUT/DELETE are idempotent and reflected in has_reminder (FR-EXAM-02)', async () => {
      const e = await mkExam('r-1', 'scheduled', 120, 240);
      const s = await newUser();
      const put = () => http().put(`/v1/exams/${e.id}/reminder`).set(bearer(s.access_token));
      expect((await put()).status).toBe(204);
      expect((await put()).status).toBe(204);
      const d1 = await http().get(`/v1/exams/${e.id}`).set(bearer(s.access_token));
      expect(d1.body.data.has_reminder).toBe(true);
      const del = () => http().delete(`/v1/exams/${e.id}/reminder`).set(bearer(s.access_token));
      expect((await del()).status).toBe(204);
      expect((await del()).status).toBe(204);
      const d2 = await http().get(`/v1/exams/${e.id}`).set(bearer(s.access_token));
      expect(d2.body.data.has_reminder).toBe(false);
    });
  });

  describe('paper', () => {
    it('builds a paper without answers and an answer key in Redis', async () => {
      const e = await mkExam('pp-1', 'running', -5, 60);
      const qs = await attachQuestions(e.id, 3);
      const { paper, key } = await app.get(PaperService).build(e.id);
      expect(paper.questions).toHaveLength(3);
      expect(JSON.stringify(paper)).not.toMatch(/correct_option|explanation/);
      expect(Object.keys(key.correct).sort()).toEqual(qs.map((q) => String(q.id)).sort());
      expect(await redis.client.exists(`exam:${e.id}:paper`, `exam:${e.id}:key`)).toBe(2);
    });

    it('refuses to build when question count does not match', async () => {
      const e = await mkExam('pp-bad', 'scheduled', 10, 60, { question_count: 5 });
      await attachQuestions(e.id, 2);
      await expect(app.get(PaperService).build(e.id)).rejects.toMatchObject({
        code: 'EXAM_NOT_PUBLISHABLE',
      });
    });

    it('GET /paper: 425 before start, 403 without an attempt, 200 with one', async () => {
      const e = await mkExam('pp-2', 'running', -5, 60);
      await attachQuestions(e.id, 3);
      const future = await mkExam('pp-3', 'scheduled', 120, 240);
      const s = await newUser();

      const early = await http().get(`/v1/exams/${future.id}/paper`).set(bearer(s.access_token));
      expect(early.status).toBe(425);
      const none = await http().get(`/v1/exams/${e.id}/paper`).set(bearer(s.access_token));
      expect(none.status).toBe(403);

      await prisma.attempts.create({
        data: {
          user_id: BigInt(s.user.id),
          exam_id: e.id,
          kind: 'live',
          started_at: new Date(),
          total_questions: 3,
        },
      });
      const ok = await http().get(`/v1/exams/${e.id}/paper`).set(bearer(s.access_token));
      expectContract(ok);
      expect(ok.status).toBe(200);
      expect(ok.body.data.exam_id).toBe(String(e.id));
    });
  });
});
