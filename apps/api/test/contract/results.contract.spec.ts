import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AttemptsService } from '../../src/attempts/attempts.service';
import { MeritService } from '../../src/attempts/merit.service';
import { ScoringConsumer } from '../../src/attempts/scoring.consumer';
import { ScoringService } from '../../src/attempts/scoring.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { ExamJobsService } from '../../src/exams/exam-jobs.service';
import { PaperService } from '../../src/exams/paper.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

describe('contract + integration: scoring, result, solutions, leaderboard, merit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let consumer: ScoringConsumer;
  let jobs: ExamJobsService;
  const phones: string[] = [];
  const examIds: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async (district?: number) => {
    const phone = randomPhone();
    phones.push(phone);
    const s = await registerUser(app, phone);
    if (district) {
      await http()
        .patch('/v1/me')
        .set(bearer(s.access_token))
        .send({ district_id: district })
        .expect(200);
    }
    return s;
  };

  /** 3 questions, 1 mark each, 0.5 negative; start/end relative to now in minutes. */
  const mkExam = async (
    slug: string,
    startMin: number,
    endMin: number,
    status: 'running' | 'ended' = 'running',
    pass: number | null = null,
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
        question_count: 3,
        total_marks: 3,
        negative_mark: 0.5,
        pass_marks: pass,
        is_premium: false,
        status,
      },
    });
    examIds.push(e.id);
    const qs = await prisma.questions.findMany({
      where: { status: 'published' },
      select: { id: true, correct_option: true },
      take: 3,
      orderBy: { id: 'asc' },
    });
    await prisma.exam_questions.createMany({
      data: qs.map((q, i) => ({ exam_id: e.id, question_id: q.id, position: i + 1 })),
    });
    const right = qs.map((q) => ({ id: String(q.id), a: q.correct_option as string }));
    const wrong = (a: string) => (a === 'a' ? 'b' : 'a');
    return { exam: e, right, wrong };
  };

  const start = (s: Session, examId: bigint, body: object = {}) =>
    http().post(`/v1/exams/${examId}/start`).set(bearer(s.access_token)).send(body);
  const submit = (s: Session, attemptId: string, answers: Record<string, string>, focus = 0) =>
    http()
      .post(`/v1/attempts/${attemptId}/submit`)
      .set(bearer(s.access_token))
      .send({ answers, focus_loss_count: focus });
  const result = (s: Session, attemptId: string) =>
    http().get(`/v1/attempts/${attemptId}/result`).set(bearer(s.access_token));

  /** Drain the whole queue the way the worker would. */
  const runWorker = async () => {
    for (let i = 0; i < 20; i++) if ((await consumer.runOnce()) === 0) break;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    consumer = new ScoringConsumer(redis, app.get(ScoringService));
    jobs = new ExamJobsService(
      prisma,
      redis,
      app.get(PaperService),
      app.get(AttemptsService),
      new MeritService(prisma, redis),
    );
    // Start from an empty queue so entries of other test files cannot be rescored here.
    await redis.client.xgroup('DESTROY', 'q:submit', 'scorers').catch(() => undefined);
    await redis.client.del('q:submit');
    await consumer.ensureGroup();
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
      ...(await Promise.all(examIds.map((id) => redis.client.keys(`*${id}*`)))).flat(),
    ];
    if (keys.length > 0) await redis.client.del(...new Set(keys));
    await prisma.attempts.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await redis.client.xgroup('DESTROY', 'q:submit', 'scorers').catch(() => undefined);
    await app.close();
  });

  describe('scoring + result', () => {
    it('202 until the worker ran, then the full result (FR-RES-01, 04)', async () => {
      const { exam, right, wrong } = await mkExam('r-basic', -5, 60, 'running', 1);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;

      const early = await result(s, id);
      expect(early.status).toBe(403); // not submitted yet

      await submit(
        s,
        id,
        {
          [right[0]?.id as string]: right[0]?.a as string,
          [right[1]?.id as string]: right[1]?.a as string,
          [right[2]?.id as string]: wrong(right[2]?.a as string),
        },
        3,
      ).expect(202);
      const scoring = await result(s, id);
      expectContract(scoring);
      expect(scoring.status).toBe(202);

      await runWorker();
      const res = await result(s, id);
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        attempt_id: id,
        exam_id: String(exam.id),
        total_questions: 3,
        correct: 2,
        wrong: 1,
        skipped: 0,
        score: 1.5,
        total_marks: 3,
        negative_marks: 0.5,
        accuracy_pct: 66.7,
        passed: true,
        solutions_available: false,
      });
      expect(res.body.data.solutions_available_at).toEqual(expect.any(String));
      expect(res.body.data.sections.length).toBeGreaterThan(0);
      // Provisional rank straight from Redis.
      expect(res.body.data.rank).toMatchObject({ overall: 1, participants: 1, is_final: false });

      const row = await prisma.attempts.findFirst({
        where: { id: BigInt(id), user_id: BigInt(s.user.id) },
      });
      expect(row).toMatchObject({ status: 'scored', focus_loss_count: 3, correct_count: 2 });
      expect(row?.submitted_at).not.toBeNull();
    });

    it('scoring the same entry twice is harmless (idempotent upsert)', async () => {
      const { exam, right } = await mkExam('r-idem', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await submit(s, id, { [right[0]?.id as string]: right[0]?.a as string }).expect(202);
      const [entry] = await redis.client.xrange('q:submit', '-', '+');
      const fields = entry?.[1] ?? [];
      await runWorker();
      const first = await prisma.attempts.findFirst({
        where: { id: BigInt(id), user_id: BigInt(s.user.id) },
      });

      // Replay the same message by hand.
      await redis.client.xadd('q:submit', '*', ...fields);
      await runWorker();
      const second = await prisma.attempts.findFirst({
        where: { id: BigInt(id), user_id: BigInt(s.user.id) },
      });
      expect(Number(second?.score)).toBe(Number(first?.score));
      expect(await prisma.attempts.count({ where: { exam_id: exam.id } })).toBe(1);
      expect(await redis.client.zcard(`lb:${exam.id}`)).toBe(1);
    });

    it("404 for someone else's result", async () => {
      const { exam } = await mkExam('r-own', -5, 60);
      const a = await newUser();
      const b = await newUser();
      const id = (await start(a, exam.id)).body.data.attempt_id;
      expect((await result(b, id)).status).toBe(404);
    });

    it('drops malformed queue entries instead of looping on them', async () => {
      await redis.client.xadd('q:submit', '*', 'attempt_id', 'nope');
      await runWorker();
      const pending = (await redis.client.xpending('q:submit', 'scorers')) as [
        number,
        ...unknown[],
      ];
      expect(pending[0]).toBe(0);
    });
  });

  describe('solutions (FR-RES-05)', () => {
    it('403 SOLUTIONS_LOCKED while the exam runs', async () => {
      const { exam } = await mkExam('sol-lock', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await submit(s, id, {}).expect(202);
      await runWorker();
      const res = await http().get(`/v1/attempts/${id}/solutions`).set(bearer(s.access_token));
      expectContract(res);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SOLUTIONS_LOCKED');
    });

    it('opens after the exam ends and filters all/wrong/skipped/correct', async () => {
      const { exam, right, wrong } = await mkExam('sol-open', -5, 60);
      const s = await newUser();
      const id = (await start(s, exam.id)).body.data.attempt_id;
      await submit(s, id, {
        [right[0]?.id as string]: right[0]?.a as string,
        [right[1]?.id as string]: wrong(right[1]?.a as string),
      }).expect(202);
      await runWorker();
      // The exam ends: pull end_at into the past.
      await prisma.exams.update({
        where: { id: exam.id },
        data: { end_at: new Date(Date.now() - 1000), status: 'ended' },
      });
      const get = async (filter: string) => {
        const res = await http()
          .get(`/v1/attempts/${id}/solutions?filter=${filter}`)
          .set(bearer(s.access_token));
        expectContract(res);
        expect(res.status).toBe(200);
        return res.body.data as { result: string; my_answer: string | null; question: object }[];
      };
      const all = await get('all');
      expect(all.map((x) => x.result)).toEqual(['correct', 'wrong', 'skipped']);
      expect(all[0]?.question).toHaveProperty('correct_option');
      expect((await get('wrong')).map((x) => x.result)).toEqual(['wrong']);
      expect((await get('skipped')).map((x) => x.result)).toEqual(['skipped']);
      expect((await get('correct')).map((x) => x.result)).toEqual(['correct']);
    });
  });

  describe('leaderboard (FR-RES-06)', () => {
    it('orders by score then time, pins my row, supports district scope', async () => {
      const { exam, right, wrong } = await mkExam('lb-1', -5, 60);
      const top = await newUser(1);
      const mid = await newUser(1);
      const low = await newUser(2);
      const all = (s: Session) => ({ s, id: '' });
      const players = [all(top), all(mid), all(low)];
      for (const p of players) p.id = (await start(p.s, exam.id)).body.data.attempt_id;

      const rightAll = Object.fromEntries(right.map((r) => [r.id, r.a]));
      const oneRight = { [right[0]?.id as string]: right[0]?.a as string };
      await submit(top, players[0]?.id as string, rightAll).expect(202); // 3.0
      await submit(mid, players[1]?.id as string, oneRight).expect(202); // 1.0
      await submit(
        low,
        players[2]?.id as string,
        Object.fromEntries(right.map((r) => [r.id, wrong(r.a)])),
      ).expect(202); // -1.5
      await runWorker();

      const board = await http()
        .get(`/v1/exams/${exam.id}/leaderboard`)
        .set(bearer(low.access_token));
      expectContract(board);
      expect(board.status).toBe(200);
      expect(board.body.data.is_final).toBe(false);
      expect(board.body.data.participants).toBe(3);
      expect(board.body.data.top.map((r: { user_id: string }) => r.user_id)).toEqual([
        top.user.id,
        mid.user.id,
        low.user.id,
      ]);
      expect(board.body.data.top[0]).toMatchObject({ rank: 1, score: 3 });
      expect(board.body.data.me).toMatchObject({ rank: 3, user_id: low.user.id });

      const district = await http()
        .get(`/v1/exams/${exam.id}/leaderboard?scope=district`)
        .set(bearer(mid.access_token));
      expectContract(district);
      expect(district.body.data.participants).toBe(2);
      expect(district.body.data.top.map((r: { user_id: string }) => r.user_id)).toEqual([
        top.user.id,
        mid.user.id,
      ]);
    });

    it('a user who did not play has no "me" row', async () => {
      const { exam } = await mkExam('lb-2', -5, 60);
      const s = await newUser();
      const res = await http().get(`/v1/exams/${exam.id}/leaderboard`).set(bearer(s.access_token));
      expectContract(res);
      expect(res.body.data.top).toEqual([]);
      expect(res.body.data.me).toBeUndefined();
    });
  });

  describe('scheduler: auto-submit and merit publish (FR-RES-02, 03)', () => {
    it('submits open attempts after end + grace, then publishes final ranks', async () => {
      const { exam, right, wrong } = await mkExam('m-1', -5, 60);
      const a = await newUser(1);
      const b = await newUser(1);
      const c = await newUser(2);
      const ida = (await start(a, exam.id)).body.data.attempt_id;
      const idb = (await start(b, exam.id)).body.data.attempt_id;
      const idc = (await start(c, exam.id)).body.data.attempt_id;
      const rightAll = Object.fromEntries(right.map((r) => [r.id, r.a]));
      // a submits by hand; b and c only sync and never press submit.
      await submit(a, ida, { [right[0]?.id as string]: right[0]?.a as string }).expect(202);
      await http()
        .put(`/v1/attempts/${idb}/answers`)
        .set(bearer(b.access_token))
        .send({ answers: rightAll })
        .expect(200);
      await http()
        .put(`/v1/attempts/${idc}/answers`)
        .set(bearer(c.access_token))
        .send({ answers: Object.fromEntries(right.map((r) => [r.id, wrong(r.a)])) })
        .expect(200);

      // Nothing happens while the exam is open.
      const t0 = new Date();
      expect(await jobs.autoSubmitEnded(t0)).toBe(0);

      // The exam ended more than the grace period ago.
      await prisma.exams.update({
        where: { id: exam.id },
        data: { end_at: new Date(Date.now() - 90_000), status: 'running' },
      });
      const queued = await jobs.autoSubmitEnded(new Date());
      expect(queued).toBe(2); // a was already queued
      expect(await jobs.autoSubmitEnded(new Date())).toBe(0); // second pass is a no-op

      // Merit waits for the worker.
      await jobs.flipStatuses(new Date());
      // (Other exams in the shared dev DB may legitimately publish, so look at this exam only.)
      const statusOf = async () =>
        (await prisma.exams.findUniqueOrThrow({ where: { id: exam.id } })).status;
      await jobs.publishMerit(new Date(Date.now() + 10 * 60_000));
      expect(await statusOf()).toBe('ended');
      await runWorker();

      // result_publish_at not reached yet: end + 5 min.
      await jobs.publishMerit(new Date());
      expect(await statusOf()).toBe('ended');
      await jobs.publishMerit(new Date(Date.now() + 6 * 60_000));
      expect(await statusOf()).toBe('merit_published');

      const fresh = await prisma.exams.findUniqueOrThrow({ where: { id: exam.id } });
      expect(fresh.status).toBe('merit_published');

      const res = await result(b, idb);
      expectContract(res);
      expect(res.body.data.rank).toEqual({
        overall: 1,
        district: 1,
        percentile: 66.67,
        participants: 3,
        is_final: true,
      });
      const ra = await result(a, ida);
      expect(ra.body.data.rank).toMatchObject({ overall: 2, district: 2, is_final: true });
      const rc = await result(c, idc);
      expect(rc.body.data.rank).toMatchObject({ overall: 3, district: 1, percentile: 0 });

      const board = await http()
        .get(`/v1/exams/${exam.id}/leaderboard`)
        .set(bearer(c.access_token));
      expectContract(board);
      expect(board.body.data.is_final).toBe(true);
      expect(board.body.data.top.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3]);
    });

    it('flips status by the clock and folds the participant counter into MySQL', async () => {
      const { exam } = await mkExam('m-flip', -5, 60);
      await prisma.exams.update({ where: { id: exam.id }, data: { status: 'scheduled' } });
      const s = await newUser();
      await start(s, exam.id).expect(201);
      await jobs.flipStatuses(new Date());
      await jobs.flushParticipants();
      const row = await prisma.exams.findUniqueOrThrow({ where: { id: exam.id } });
      expect(row.status).toBe('running');
      expect(row.participant_count).toBe(1);
      await jobs.flushParticipants();
      expect(
        (await prisma.exams.findUniqueOrThrow({ where: { id: exam.id } })).participant_count,
      ).toBe(1);
    });
  });

  describe('GET /me/attempts', () => {
    it('pages my attempts newest first with titles and scores', async () => {
      const first = await mkExam('h-1', -5, 60);
      const second = await mkExam('h-2', -5, 60);
      const s = await newUser();
      const id1 = (await start(s, first.exam.id)).body.data.attempt_id;
      await submit(s, id1, {}).expect(202);
      await runWorker();
      await new Promise((r) => setTimeout(r, 20));
      const id2 = (await start(s, second.exam.id)).body.data.attempt_id;

      const p1 = await http().get('/v1/me/attempts?limit=1').set(bearer(s.access_token));
      expectContract(p1);
      expect(p1.status).toBe(200);
      expect(p1.body.data).toHaveLength(1);
      expect(p1.body.data[0]).toMatchObject({
        attempt_id: id2,
        status: 'in_progress',
        score: null,
      });
      expect(p1.body.meta.has_more).toBe(true);

      const p2 = await http()
        .get(`/v1/me/attempts?limit=1&cursor=${p1.body.meta.next_cursor}`)
        .set(bearer(s.access_token));
      expectContract(p2);
      expect(p2.body.data[0]).toMatchObject({
        attempt_id: id1,
        kind: 'live',
        status: 'scored',
        score: 0,
        total_marks: 3,
      });
      expect(p2.body.meta.has_more).toBe(false);

      const none = await http().get('/v1/me/attempts?kind=model').set(bearer(s.access_token));
      expect(none.body.data).toEqual([]);
      expect(
        (await http().get('/v1/me/attempts?cursor=bad').set(bearer(s.access_token))).status,
      ).toBe(400);
    });
  });
});
