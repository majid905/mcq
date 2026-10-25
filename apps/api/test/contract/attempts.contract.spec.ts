import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

describe('contract + integration: start, answer sync, submit', () => {
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
    startMin: number,
    endMin: number,
    extra: {
      is_premium?: boolean;
      type?: 'live' | 'model';
      status?: 'scheduled' | 'running' | 'ended';
    } = {},
  ) => {
    const now = Date.now();
    const e = await prisma.exams.create({
      data: {
        type: extra.type ?? 'live',
        category_id: 5,
        title_bn: `পরীক্ষা ${slug}`,
        title_en: `Exam ${slug}`,
        slug: `${slug}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        start_at: extra.type === 'model' ? null : new Date(now + startMin * 60_000),
        end_at: extra.type === 'model' ? null : new Date(now + endMin * 60_000),
        duration_sec: 1800,
        question_count: 3,
        total_marks: 3,
        is_premium: extra.is_premium ?? false,
        status: extra.status ?? 'running',
      },
    });
    examIds.push(e.id);
    const qs = await prisma.questions.findMany({
      where: { status: 'published' },
      select: { id: true },
      take: 3,
      orderBy: { id: 'asc' },
    });
    await prisma.exam_questions.createMany({
      data: qs.map((q, i) => ({ exam_id: e.id, question_id: q.id, position: i + 1 })),
    });
    return { exam: e, qids: qs.map((q) => String(q.id)) };
  };

  const start = (s: Session, examId: bigint, body: object = {}) =>
    http().post(`/v1/exams/${examId}/start`).set(bearer(s.access_token)).send(body);

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
    const rows = await prisma.attempts.findMany({
      where: { user_id: { in: userIds } },
      select: { id: true },
    });
    const keys = [
      ...rows.flatMap((r) => [
        `att:${r.id}:meta`,
        `att:${r.id}:answers`,
        `att:${r.id}:extra`,
        `att:${r.id}:submitted`,
      ]),
      ...examIds.flatMap((id) => [`exam:${id}:paper`, `exam:${id}:key`, `exam:${id}:participants`]),
    ];
    if (keys.length > 0) await redis.client.del(...keys);
    await prisma.attempts.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.subscriptions.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await redis.client.del(...userIds.map((id) => `user:${id}:sub`));
    await app.close();
  });

  describe('POST /exams/{id}/start', () => {
    it('starts a ranked attempt: seed, deadline, inline paper without answers (FR-EXAM-04, 05)', async () => {
      const { exam } = await mkExam('s-run', -5, 60);
      const s = await newUser();
      const res = await start(s, exam.id).set('X-Platform', 'web');
      expectContract(res);
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d.kind).toBe('live');
      expect(d.shuffle_seed).toEqual(expect.any(Number));
      // 30 min duration < remaining window, so the deadline is start + duration.
      const span = new Date(d.ends_at).getTime() - new Date(d.started_at).getTime();
      expect(span).toBe(1800_000);
      expect(d.paper.questions).toHaveLength(3);
      expect(JSON.stringify(d)).not.toMatch(/correct_option|explanation/);
      const row = await prisma.attempts.findFirst({
        where: { id: BigInt(d.attempt_id), user_id: BigInt(s.user.id) },
      });
      expect(row?.client_platform).toBe('web');
      expect(await redis.client.get(`exam:${exam.id}:participants`)).toBe('1');
    });

    it('late join: the deadline is the exam end, not start + duration', async () => {
      const { exam } = await mkExam('s-late', -50, 10);
      const s = await newUser();
      const res = await start(s, exam.id);
      expect(res.status).toBe(201);
      expect(new Date(res.body.data.ends_at).getTime()).toBe(exam.end_at?.getTime());
    });

    it('425 before the start time (FR-EXAM-04)', async () => {
      const { exam } = await mkExam('s-early', 30, 120, { status: 'scheduled' });
      const s = await newUser();
      const res = await start(s, exam.id);
      expectContract(res);
      expect(res.status).toBe(425);
      expect(res.body.error.code).toBe('EXAM_NOT_STARTED');
    });

    it('410 once less than a minute is left', async () => {
      const { exam } = await mkExam('s-cut', -50, 0.5);
      const s = await newUser();
      const res = await start(s, exam.id);
      expect(res.status).toBe(410);
    });

    it('resumes with the saved answers and the same attempt (FR-EXAM-07)', async () => {
      const { exam, qids } = await mkExam('s-resume', -5, 60);
      const s = await newUser();
      const first = await start(s, exam.id);
      const id = first.body.data.attempt_id;
      await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(s.access_token))
        .send({ answers: { [qids[0] as string]: 'b' } })
        .expect(200);
      const again = await start(s, exam.id);
      expectContract(again);
      expect(again.body.data.attempt_id).toBe(id);
      expect(again.body.data.saved_answers).toEqual({ [qids[0] as string]: 'b' });
      expect(again.body.data.ends_at).toBe(first.body.data.ends_at);
      expect(again.body.data.shuffle_seed).toBe(first.body.data.shuffle_seed);
      expect(await prisma.attempts.count({ where: { exam_id: exam.id } })).toBe(1);
    });

    it('two simultaneous starts create one attempt', async () => {
      const { exam } = await mkExam('s-race', -5, 60);
      const s = await newUser();
      const [a, b] = await Promise.all([start(s, exam.id), start(s, exam.id)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.data.attempt_id).toBe(b.body.data.attempt_id);
      expect(await prisma.attempts.count({ where: { exam_id: exam.id } })).toBe(1);
    });

    it('409 for a second ranked attempt after submitting (FR-EXAM-09)', async () => {
      const { exam } = await mkExam('s-twice', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: {} })
        .expect(202);
      const res = await start(s, exam.id);
      expectContract(res);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_ATTEMPTED');
    });

    it('practice mode only after the exam ended, unranked (FR-EXAM-11)', async () => {
      const running = await mkExam('s-p-run', -5, 60);
      const ended = await mkExam('s-p-end', -300, -200, { status: 'ended' });
      const s = await newUser();
      const early = await start(s, running.exam.id, { mode: 'practice' });
      expect(early.status).toBe(400);

      const res = await start(s, ended.exam.id, { mode: 'practice' });
      expectContract(res);
      expect(res.status).toBe(201);
      expect(res.body.data.kind).toBe('live_practice');
      // Full duration from now, not tied to the (past) exam end.
      const span = new Date(res.body.data.ends_at).getTime() - Date.now();
      expect(span).toBeGreaterThan(1700_000);

      const ranked = await start(s, ended.exam.id);
      expect(ranked.status).toBe(410);
    });

    it('402 PREMIUM_REQUIRED without a subscription, ok with one (FR-EXAM-03)', async () => {
      const { exam } = await mkExam('s-prem', -5, 60, { is_premium: true });
      const s = await newUser();
      const res = await start(s, exam.id);
      expectContract(res);
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('PREMIUM_REQUIRED');

      await prisma.subscriptions.create({
        data: {
          user_id: BigInt(s.user.id),
          source: 'manual',
          starts_at: new Date(Date.now() - 3600_000),
          ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      await redis.client.del(`user:${s.user.id}:sub`);
      expect((await start(s, exam.id)).status).toBe(201);
    });

    it('402 QUOTA_EXHAUSTED after the free monthly live exams (FR-EXAM-03)', async () => {
      const s = await newUser();
      for (let i = 0; i < 4; i++) {
        await prisma.attempts.create({
          data: {
            user_id: BigInt(s.user.id),
            exam_id: null,
            kind: 'live',
            started_at: new Date(),
            total_questions: 3,
          },
        });
      }
      const { exam } = await mkExam('s-quota', -5, 60);
      const res = await start(s, exam.id);
      expectContract(res);
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('QUOTA_EXHAUSTED');
      expect(res.body.error.details.resets_at).toEqual(expect.any(String));
    });

    it('model tests can be taken any time, with the full duration', async () => {
      const { exam } = await mkExam('s-model', 0, 0, { type: 'model', status: 'running' });
      const s = await newUser();
      const res = await start(s, exam.id);
      expectContract(res);
      expect(res.status).toBe(201);
      expect(res.body.data.kind).toBe('model');
    });
  });

  describe('PUT /attempts/{id}/answers', () => {
    it('stores the full map in Redis only, drops unknown questions, is idempotent', async () => {
      const { exam, qids } = await mkExam('a-sync', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      const put = (answers: Record<string, string>) =>
        http().put(`/v1/attempts/${id}/answers`).set(bearer(s.access_token)).send({ answers });

      const r1 = await put({
        [qids[0] as string]: 'a',
        [qids[1] as string]: 'c',
        '999999999': 'a',
      });
      expectContract(r1);
      expect(r1.status).toBe(200);
      expect(r1.body.data.saved_count).toBe(2);
      expect(await redis.client.hgetall(`att:${id}:answers`)).toEqual({
        [qids[0] as string]: 'a',
        [qids[1] as string]: 'c',
      });
      // Changing an answer and un-answering one: the map is replaced, not merged.
      await put({ [qids[0] as string]: 'd' }).expect(200);
      expect(await redis.client.hgetall(`att:${id}:answers`)).toEqual({ [qids[0] as string]: 'd' });
      // Nothing was written to MySQL.
      const row = await prisma.attempts.findFirst({
        where: { id: BigInt(id), user_id: BigInt(s.user.id) },
      });
      expect(row?.answers).toBeNull();
    });

    it('validates option keys and ids', async () => {
      const { exam } = await mkExam('a-valid', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      const bad = await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(s.access_token))
        .send({ answers: { '12': 'z' } });
      expect(bad.status).toBe(400);
    });

    it("404 for someone else's attempt", async () => {
      const { exam } = await mkExam('a-own', -5, 60);
      const a = await newUser();
      const b = await newUser();
      const id = (await start(a, exam.id)).body.data.attempt_id;
      const res = await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(b.access_token))
        .send({ answers: {} });
      expect(res.status).toBe(404);
    });

    it('410 after the deadline + 60 s grace, accepted inside the grace (FR-EXAM-08)', async () => {
      const { exam } = await mkExam('a-grace', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      const send = () =>
        http().put(`/v1/attempts/${id}/answers`).set(bearer(s.access_token)).send({ answers: {} });

      await redis.client.hset(`att:${id}:meta`, 'ends_ms', String(Date.now() - 30_000));
      expect((await send()).status).toBe(200);

      await redis.client.hset(`att:${id}:meta`, 'ends_ms', String(Date.now() - 61_000));
      const late = await send();
      expectContract(late);
      expect(late.status).toBe(410);
      expect(late.body.error.code).toBe('ATTEMPT_CLOSED');
    });

    it('rebuilds the Redis state from MySQL after a cache loss', async () => {
      const { exam } = await mkExam('a-miss', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await redis.client.del(`att:${id}:meta`);
      const res = await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(s.access_token))
        .send({ answers: {} });
      expect(res.status).toBe(200);
    });

    it('limits a single attempt to 6 syncs a minute', async () => {
      const { exam } = await mkExam('a-rate', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      let last = 200;
      for (let i = 0; i < 7; i++) {
        last = (
          await http()
            .put(`/v1/attempts/${id}/answers`)
            .set(bearer(s.access_token))
            .send({ answers: {} })
        ).status;
      }
      expect(last).toBe(429);
    });
  });

  describe('POST /attempts/{id}/submit', () => {
    const lastEntryFor = async (attemptId: string) => {
      const entries = await redis.client.xrevrange('q:submit', '+', '-', 'COUNT', 500);
      return entries.filter(([, f]) => f[f.indexOf('attempt_id') + 1] === attemptId);
    };

    it('answers 202 fast, queues once on q:submit and is idempotent (FR-EXAM-08)', async () => {
      const { exam, qids } = await mkExam('x-sub', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      const t0 = Date.now();
      const res = await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: { [qids[0] as string]: 'a' }, focus_loss_count: 2 });
      const took = Date.now() - t0;
      expectContract(res);
      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe('received');
      expect(took).toBeLessThan(500);

      const again = await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: { [qids[0] as string]: 'b' } });
      expect(again.status).toBe(202);

      const entries = await lastEntryFor(id);
      expect(entries).toHaveLength(1);
      // The second submit must not overwrite the first set of answers.
      expect(await redis.client.hgetall(`att:${id}:answers`)).toEqual({ [qids[0] as string]: 'a' });
      expect(await redis.client.hget(`att:${id}:extra`, 'focus_loss')).toBe('2');
      for (const [eid] of entries) await redis.client.xdel('q:submit', eid);
    });

    it('sync after submit is refused', async () => {
      const { exam } = await mkExam('x-closed', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: {} })
        .expect(202);
      const res = await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(s.access_token))
        .send({ answers: {} });
      expect(res.status).toBe(410);
      for (const [eid] of await lastEntryFor(id)) await redis.client.xdel('q:submit', eid);
    });

    it('410 after the grace window, nothing queued', async () => {
      const { exam } = await mkExam('x-late', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await redis.client.hset(`att:${id}:meta`, 'ends_ms', String(Date.now() - 61_000));
      const res = await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: {} });
      expectContract(res);
      expect(res.status).toBe(410);
      expect(await lastEntryFor(id)).toHaveLength(0);
    });
  });
});
