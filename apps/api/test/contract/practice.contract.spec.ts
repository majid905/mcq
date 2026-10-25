import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ScoringConsumer } from '../../src/attempts/scoring.consumer';
import { ScoringService } from '../../src/attempts/scoring.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { dhakaDayOf } from '../../src/stats/stats-logic';
import { StatsConsumer } from '../../src/stats/stats.consumer';
import { StatsService } from '../../src/stats/stats.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

interface Paper {
  questions: { id: string; options: { key: string }[] }[];
}

describe('contract + integration: practice, quick answer, stats rollup, analytics', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let stats: StatsConsumer;
  let scoring: ScoringConsumer;
  const phones: string[] = [];
  const nodeIds: number[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async (): Promise<Session> => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(app, phone);
  };
  const create = (s: Session, body: object) =>
    http().post('/v1/practice/sessions').set(bearer(s.access_token)).send(body);
  const answer = (s: Session, attemptId: string, questionId: string, option: string) =>
    http()
      .post(`/v1/practice/sessions/${attemptId}/answer`)
      .set(bearer(s.access_token))
      .send({ question_id: questionId, option });
  const drainStats = async () => {
    for (let i = 0; i < 20; i++) if ((await stats.runOnce()) === 0) break;
  };
  const drainScoring = async () => {
    for (let i = 0; i < 20; i++) if ((await scoring.runOnce()) === 0) break;
  };
  const correctOf = async (ids: string[]) =>
    new Map(
      (
        await prisma.questions.findMany({
          where: { id: { in: ids.map((i) => BigInt(i)) } },
          select: { id: true, correct_option: true },
        })
      ).map((q) => [String(q.id), q.correct_option]),
    );
  const wrongOption = (right: string) => (right === 'a' ? 'b' : 'a');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    stats = new StatsConsumer(redis, prisma, new StatsService(prisma, redis));
    scoring = new ScoringConsumer(redis, app.get(ScoringService));
    for (const key of ['q:stats', 'q:submit']) {
      for (const group of ['stats', 'scorers']) {
        await redis.client.xgroup('DESTROY', key, group).catch(() => undefined);
      }
      await redis.client.del(key);
    }
    await stats.ensureGroup();
    await scoring.ensureGroup();
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
    const ids = users.map((u) => u.id);
    const attempts = await prisma.attempts.findMany({
      where: { user_id: { in: ids } },
      select: { id: true },
    });
    const keys = [
      ...attempts.flatMap((a) => [
        `att:${a.id}:meta`,
        `att:${a.id}:answers`,
        `att:${a.id}:extra`,
        `att:${a.id}:pkey`,
        `att:${a.id}:submitted`,
      ]),
      ...ids.flatMap((id) => [`seen:${id}`, `user:${id}:sub`]),
      ...(await redis.client.keys('quota:practice:*')),
    ];
    if (keys.length > 0) await redis.client.del(...new Set(keys));
    await prisma.attempts.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user_topic_stats.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user_daily_stats.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user_wrong_questions.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.taxonomy_nodes.deleteMany({ where: { id: { in: nodeIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } }); // cascades streaks, bookmarks
    await redis.client.del('q:stats');
    await app.close();
  });

  describe('POST /practice/sessions', () => {
    it('quick session: fresh questions, inline paper without answers, untimed (FR-PRAC-02)', async () => {
      const s = await newUser();
      const res = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      expectContract(res);
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d.kind).toBe('quick_practice');
      expect(d.paper.questions).toHaveLength(5);
      expect(new Set(d.paper.questions.map((q: { id: string }) => q.id)).size).toBe(5);
      expect(JSON.stringify(d)).not.toMatch(/correct_option|explanation/);
      expect(new Date(d.ends_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    });

    it('validates the request and unknown topics', async () => {
      const s = await newUser();
      expect((await create(s, { mode: 'quick' })).status).toBe(400); // node_ids missing
      expect((await create(s, { mode: 'nope' })).status).toBe(400);
      expect((await create(s, { mode: 'quick', node_ids: ['1'], question_count: 2 })).status).toBe(
        400,
      );
      expect((await create(s, { mode: 'quick', node_ids: ['99999999'] })).status).toBe(400);
    });

    it('422 NOT_ENOUGH_QUESTIONS for a topic without questions', async () => {
      const s = await newUser();
      const node = await prisma.taxonomy_nodes.create({
        data: {
          parent_id: 1,
          type: 'topic',
          name_bn: 'খালি',
          name_en: 'Empty',
          slug: `empty-${Date.now()}`,
          path: `/1/${Date.now() % 1_000_000}/`,
          depth: 1,
        },
      });
      nodeIds.push(node.id);
      const res = await create(s, {
        mode: 'quick',
        node_ids: [String(node.id)],
        question_count: 5,
      });
      expectContract(res);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('NOT_ENOUGH_QUESTIONS');
    });

    it('never hands premium questions to a free user', async () => {
      const s = await newUser();
      const res = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 30 });
      const ids = (res.body.data.paper as Paper).questions.map((q) => BigInt(q.id));
      const premium = await prisma.questions.count({
        where: { id: { in: ids }, is_premium: true },
      });
      expect(premium).toBe(0);
    });

    it('custom session: timed, shuffle seed, same question never twice', async () => {
      const s = await newUser();
      const res = await create(s, {
        mode: 'custom',
        node_ids: ['1', '2'],
        question_count: 10,
        duration_sec: 600,
        difficulty: 'mixed',
      });
      expectContract(res);
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d.kind).toBe('custom');
      expect(d.shuffle_seed).toEqual(expect.any(Number));
      expect(d.shuffle_options).toBe(true);
      const span = new Date(d.ends_at).getTime() - new Date(d.started_at).getTime();
      expect(span).toBe(600_000);
      expect(new Set(d.paper.questions.map((q: { id: string }) => q.id)).size).toBe(10);
    });

    it('difficulty filter and exclude_seen work', async () => {
      const s = await newUser();
      const hard = await create(s, {
        mode: 'quick',
        node_ids: ['1', '2', '3', '4', '5'],
        question_count: 5,
        difficulty: 'hard',
      });
      if (hard.status === 201) {
        const rows = await prisma.questions.findMany({
          where: { id: { in: (hard.body.data.paper as Paper).questions.map((q) => BigInt(q.id)) } },
          select: { difficulty: true },
        });
        expect(rows.every((r) => r.difficulty >= 4)).toBe(true);
      } else {
        expect(hard.body.error.code).toBe('NOT_ENOUGH_QUESTIONS');
      }

      const first = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      const firstIds = (first.body.data.paper as Paper).questions.map((q) => q.id);
      await redis.client.sadd(`seen:${s.user.id}`, ...firstIds);
      const next = await create(s, {
        mode: 'quick',
        node_ids: ['1'],
        question_count: 5,
        exclude_seen: true,
      });
      const nextIds = (next.body.data.paper as Paper).questions.map((q) => q.id);
      expect(nextIds.some((id) => firstIds.includes(id))).toBe(false);
    });

    it('bookmarks and wrong-list modes use only those questions', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const qs = await prisma.questions.findMany({
        where: { status: 'published', is_premium: false },
        take: 6,
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      await prisma.bookmarks.createMany({
        data: qs.map((q) => ({ user_id: uid, question_id: q.id })),
      });
      const b = await create(s, { mode: 'bookmarks', question_count: 5 });
      expectContract(b);
      expect(b.status).toBe(201);
      const allowed = new Set(qs.map((q) => String(q.id)));
      expect((b.body.data.paper as Paper).questions.every((q) => allowed.has(q.id))).toBe(true);

      const lonely = await newUser();
      const none = await create(lonely, { mode: 'wrong', question_count: 5 });
      expect(none.status).toBe(422);

      await prisma.user_wrong_questions.createMany({
        data: qs.map((q) => ({ user_id: uid, question_id: q.id, last_wrong_at: new Date() })),
      });
      const w = await create(s, { mode: 'wrong', question_count: 5 });
      expect(w.status).toBe(201);
      expect((w.body.data.paper as Paper).questions.every((q) => allowed.has(q.id))).toBe(true);
    });
  });

  describe('POST /practice/sessions/{id}/answer', () => {
    it('checks answers at once, counts only the first answer, finishes the session (FR-PRAC-02)', async () => {
      const s = await newUser();
      const start = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      const id = start.body.data.attempt_id;
      const qids = (start.body.data.paper as Paper).questions.map((q) => q.id);
      const right = await correctOf(qids);

      const ok = await answer(s, id, qids[0] as string, right.get(qids[0] as string) as string);
      expectContract(ok);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({
        is_correct: true,
        correct_option: right.get(qids[0] as string),
      });

      const bad = await answer(
        s,
        id,
        qids[1] as string,
        wrongOption(right.get(qids[1] as string) as string),
      );
      expect(bad.body.data.is_correct).toBe(false);

      // Answering the same question again does not count twice.
      await answer(s, id, qids[1] as string, right.get(qids[1] as string) as string);
      expect(await redis.client.hlen(`att:${id}:answers`)).toBe(2);

      // Not part of the session, bad option.
      expect((await answer(s, id, '999999999', 'a')).status).toBe(400);
      expect(
        (
          await http()
            .post(`/v1/practice/sessions/${id}/answer`)
            .set(bearer(s.access_token))
            .send({ question_id: qids[2], option: 'z' })
        ).status,
      ).toBe(400);

      for (const q of qids.slice(2)) await answer(s, id, q, right.get(q) as string);
      const row = await prisma.attempts.findFirst({
        where: { id: BigInt(id), user_id: BigInt(s.user.id) },
      });
      expect(row).toMatchObject({ status: 'scored', correct_count: 4, wrong_count: 1 });
      expect(Number(row?.score)).toBe(4);

      const result = await http().get(`/v1/attempts/${id}/result`).set(bearer(s.access_token));
      expectContract(result);
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({
        correct: 4,
        wrong: 1,
        score: 4,
        total_marks: 5,
        rank: null,
        solutions_available: true,
      });
      const sol = await http()
        .get(`/v1/attempts/${id}/solutions?filter=wrong`)
        .set(bearer(s.access_token));
      expectContract(sol);
      expect(sol.body.data).toHaveLength(1);
      expect(sol.body.data[0]).toMatchObject({ result: 'wrong', question: { id: qids[1] } });

      const another = await answer(s, id, qids[0] as string, 'a');
      expect(another.status).toBe(410); // session is over
    });

    it("another user's session is 404", async () => {
      const a = await newUser();
      const b = await newUser();
      const start = await create(a, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      const q = (start.body.data.paper as Paper).questions[0]?.id as string;
      expect((await answer(b, start.body.data.attempt_id, q, 'a')).status).toBe(404);
    });

    it('stops free users at the daily limit with the reset time (FR-PRAC-06)', async () => {
      const s = await newUser();
      const start = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      const id = start.body.data.attempt_id;
      const qids = (start.body.data.paper as Paper).questions.map((q) => q.id);
      await redis.client.set(`quota:practice:${s.user.id}:${dhakaDayOf(new Date())}`, '50');
      const res = await answer(s, id, qids[0] as string, 'a');
      expectContract(res);
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('QUOTA_EXHAUSTED');
      expect(res.body.error.details.resets_at).toEqual(expect.any(String));
      expect(await redis.client.hlen(`att:${id}:answers`)).toBe(0); // the refused answer is not kept
      expect((await create(s, { mode: 'quick', node_ids: ['1'] })).status).toBe(402);
    });
  });

  describe('custom session through the exam endpoints (FR-PRAC-03)', () => {
    it('sync, submit, worker scoring without negative marks, result and solutions', async () => {
      const s = await newUser();
      const start = await create(s, {
        mode: 'custom',
        node_ids: ['1'],
        question_count: 5,
        duration_sec: 300,
      });
      const id = start.body.data.attempt_id;
      const qids = (start.body.data.paper as Paper).questions.map((q) => q.id);
      const right = await correctOf(qids);

      const sync = await http()
        .put(`/v1/attempts/${id}/answers`)
        .set(bearer(s.access_token))
        .send({ answers: { [qids[0] as string]: 'a', '999999999': 'a' } });
      expectContract(sync);
      expect(sync.body.data.saved_count).toBe(1); // the foreign question is dropped

      const submit = await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({
          answers: {
            [qids[0] as string]: right.get(qids[0] as string),
            [qids[1] as string]: right.get(qids[1] as string),
            [qids[2] as string]: wrongOption(right.get(qids[2] as string) as string),
          },
        });
      expectContract(submit);
      expect(submit.status).toBe(202);
      await drainScoring();

      const result = await http().get(`/v1/attempts/${id}/result`).set(bearer(s.access_token));
      expectContract(result);
      expect(result.body.data).toMatchObject({
        correct: 2,
        wrong: 1,
        skipped: 2,
        score: 2, // no negative marking in custom exams
        negative_marks: 0,
        rank: null,
      });
      const sol = await http().get(`/v1/attempts/${id}/solutions`).set(bearer(s.access_token));
      expect(sol.status).toBe(200);
      expect(sol.body.data).toHaveLength(5);
    });
  });

  describe('stats rollup worker', () => {
    it('updates topic, day, streak, question and wrong-list stats, once per answer (FR-PRAC-05, FR-ANL)', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const start = await create(s, { mode: 'quick', node_ids: ['1'], question_count: 5 });
      const id = start.body.data.attempt_id;
      const qids = (start.body.data.paper as Paper).questions.map((q) => q.id);
      const right = await correctOf(qids);
      const before = await prisma.questions.findMany({
        where: { id: { in: qids.map((q) => BigInt(q)) } },
        select: { id: true, times_answered: true, times_correct: true },
      });

      for (const [i, q] of qids.entries()) {
        const r = right.get(q) as string;
        await answer(s, id, q, i === 0 ? wrongOption(r) : r);
      }
      await drainStats();

      const topics = await prisma.user_topic_stats.findMany({ where: { user_id: uid } });
      expect(topics.reduce((n, t) => n + t.attempted, 0)).toBe(5);
      expect(topics.reduce((n, t) => n + t.correct, 0)).toBe(4);

      const day = await prisma.user_daily_stats.findFirstOrThrow({ where: { user_id: uid } });
      expect(day).toMatchObject({ answered: 5, correct: 4 });
      expect(day.day.toISOString().slice(0, 10)).toBe(dhakaDayOf(new Date()));

      const streak = await prisma.user_streaks.findUniqueOrThrow({ where: { user_id: uid } });
      expect(streak).toMatchObject({ current_streak: 1, best_streak: 1 });

      const after = await prisma.questions.findMany({
        where: { id: { in: qids.map((q) => BigInt(q)) } },
        select: { id: true, times_answered: true, times_correct: true },
      });
      const gained = after.reduce(
        (n, a, i) => n + a.times_answered - (before[i]?.times_answered ?? 0),
        0,
      );
      expect(gained).toBe(5);

      const wrong = await prisma.user_wrong_questions.findMany({ where: { user_id: uid } });
      expect(wrong.map((w) => String(w.question_id))).toEqual([qids[0]]);
      expect(await redis.client.sismember(`seen:${uid}`, qids[0] as string)).toBe(1);

      // The same question answered correctly twice in a row leaves the revision list.
      const stats = new StatsService(prisma, redis);
      const topic = (
        await prisma.questions.findUniqueOrThrow({ where: { id: BigInt(qids[0] as string) } })
      ).primary_node_id;
      const ev = () => ({
        userId: uid,
        at: Date.now(),
        exam: false,
        answers: [{ questionId: BigInt(qids[0] as string), nodeId: topic, correct: true }],
      });
      await stats.apply([ev()]);
      expect(await prisma.user_wrong_questions.count({ where: { user_id: uid } })).toBe(1);
      await stats.apply([ev()]);
      expect(await prisma.user_wrong_questions.count({ where: { user_id: uid } })).toBe(0);
    });

    it('scored exam attempts feed the stats exactly once', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const start = await create(s, { mode: 'custom', node_ids: ['1'], question_count: 5 });
      const id = start.body.data.attempt_id;
      const qids = (start.body.data.paper as Paper).questions.map((q) => q.id);
      const right = await correctOf(qids);
      await http()
        .post(`/v1/attempts/${id}/submit`)
        .set(bearer(s.access_token))
        .send({ answers: Object.fromEntries(qids.map((q) => [q, right.get(q)])) })
        .expect(202);
      await drainScoring();
      await drainStats();
      const day = await prisma.user_daily_stats.findFirstOrThrow({ where: { user_id: uid } });
      expect(day).toMatchObject({ answered: 5, correct: 5, exams: 1 });

      // Redelivering the same event does not count again.
      const [entry] = [
        'attempt_id',
        id,
        'user_id',
        s.user.id,
        'exam_id',
        '',
        'kind',
        'custom',
        'at',
        String(Date.now()),
      ];
      void entry;
      await redis.client.xadd(
        'q:stats',
        '*',
        'attempt_id',
        id,
        'user_id',
        s.user.id,
        'exam_id',
        '',
        'kind',
        'custom',
        'at',
        String(Date.now()),
      );
      await drainStats();
      const again = await prisma.user_daily_stats.findFirstOrThrow({ where: { user_id: uid } });
      expect(again.answered).toBe(5);
    });
  });

  describe('analytics (FR-ANL-01..03)', () => {
    it('overview: totals, streak and a zero-filled last 7 days', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const empty = await http().get('/v1/analytics/overview').set(bearer(s.access_token));
      expectContract(empty);
      expect(empty.body.data).toMatchObject({
        answered_total: 0,
        accuracy_pct: 0,
        exams_taken: 0,
        avg_percentile: null,
        current_streak: 0,
      });
      expect(empty.body.data.last_7_days).toHaveLength(7);

      const today = dhakaDayOf(new Date());
      await prisma.user_daily_stats.create({
        data: {
          user_id: uid,
          day: new Date(`${today}T00:00:00Z`),
          answered: 20,
          correct: 15,
          exams: 2,
        },
      });
      await prisma.user_streaks.create({
        data: {
          user_id: uid,
          current_streak: 3,
          best_streak: 7,
          last_day: new Date(`${today}T00:00:00Z`),
        },
      });
      const res = await http().get('/v1/analytics/overview').set(bearer(s.access_token));
      expectContract(res);
      expect(res.body.data).toMatchObject({
        answered_total: 20,
        accuracy_pct: 75,
        exams_taken: 2,
        current_streak: 3,
        best_streak: 7,
      });
      expect(res.body.data.last_7_days[6]).toEqual({ day: today, answered: 20, correct: 15 });
      expect(res.body.data.last_7_days[0].answered).toBe(0);

      // A streak that is more than a day old is over.
      await prisma.user_streaks.update({
        where: { user_id: uid },
        data: { last_day: new Date(Date.now() - 5 * 86_400_000) },
      });
      const stale = await http().get('/v1/analytics/overview').set(bearer(s.access_token));
      expect(stale.body.data.current_streak).toBe(0);
      expect(stale.body.data.best_streak).toBe(7);
    });

    it('topics: accuracy per child, weak ones flagged', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const topic = await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: 12 } });
      await prisma.user_topic_stats.create({
        data: { user_id: uid, node_id: 12, attempted: 20, correct: 6 },
      });
      const cat = topic.path.split('/')[1] as string;
      const res = await http().get('/v1/analytics/topics').set(bearer(s.access_token));
      expectContract(res);
      const row = res.body.data.find((r: { node: { id: string } }) => r.node.id === cat);
      expect(row).toMatchObject({ attempted: 20, correct: 6, accuracy_pct: 30, is_weak: true });
      const other = res.body.data.find((r: { node: { id: string } }) => r.node.id !== cat);
      expect(other).toMatchObject({ attempted: 0, is_weak: false });
      const children = await http()
        .get(`/v1/analytics/topics?parent_id=${cat}`)
        .set(bearer(s.access_token));
      expectContract(children);
      expect(children.body.data.length).toBeGreaterThan(0);
    });

    it('progress: last live exams, oldest first', async () => {
      const s = await newUser();
      const exams = await prisma.exams.findMany({
        where: { type: 'live' },
        take: 2,
        orderBy: { id: 'asc' },
      });
      const t0 = Date.now();
      for (const [i, e] of exams.entries()) {
        await prisma.attempts.create({
          data: {
            user_id: BigInt(s.user.id),
            exam_id: e.id,
            kind: 'live',
            status: 'scored',
            started_at: new Date(t0 - (exams.length - i) * 3_600_000),
            total_questions: 30,
            score: 20 + i,
            percentile: 60 + i * 10,
          },
        });
      }
      const res = await http().get('/v1/analytics/progress').set(bearer(s.access_token));
      expectContract(res);
      expect(res.body.data).toHaveLength(exams.length);
      expect(res.body.data.map((r: { score: number }) => r.score)).toEqual(
        [20, 21].slice(0, exams.length),
      );
      expect(res.body.data[0]).toMatchObject({ exam_id: String(exams[0]?.id), percentile: 60 });
    });
  });
});
