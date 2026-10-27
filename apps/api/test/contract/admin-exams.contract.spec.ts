import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { answerKeyKey, paperKey } from '../../src/exams/paper.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { randomPhone, registerUser } from './helpers';

const PASS = 'Admin#Pass-12345';
const HOUR = 3_600_000;

describe('contract + integration: admin exams, generator, publish, monitor', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const stamp = Date.now().toString(36);
  const adminIds: number[] = [];
  const examIds: bigint[] = [];
  const phones: string[] = [];
  let superToken: string;
  let moderatorToken: string;
  let category: number;
  let subject: number;
  let topicA: number;
  let topicB: number;
  /** question ids per topic */
  const poolA: bigint[] = [];
  const poolB: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  const makeAdmin = async (role: string) => {
    const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: role } });
    const row = await prisma.admins.create({
      data: {
        email: `e${stamp}${adminIds.length}@admin.test`,
        name: `E ${role}`,
        password_hash: await app.get(PasswordService).hash(PASS),
        role_id: roleRow.id,
      },
    });
    adminIds.push(row.id);
    const login = await http()
      .post('/v1/admin/auth/login')
      .send({ email: row.email, password: PASS });
    return login.body.data.access_token as string;
  };
  const node = async (
    parent: number | null,
    type: 'category' | 'subject' | 'topic',
    name: string,
  ) => {
    const row = await prisma.taxonomy_nodes.create({
      data: {
        parent_id: parent,
        type,
        name_bn: name,
        name_en: `${name}-${stamp}`,
        slug: `${name}-${stamp}`.toLowerCase(),
        path: '/',
        depth: type === 'category' ? 0 : type === 'subject' ? 1 : 2,
      },
    });
    const parentPath = parent
      ? (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: parent } })).path
      : '/';
    await prisma.taxonomy_nodes.update({
      where: { id: row.id },
      data: { path: `${parentPath}${row.id}/` },
    });
    return row.id;
  };
  /** Published questions straight into the DB: this suite is about exams, not editing. */
  const seedQuestions = async (topic: number, count: number, tag: string, status = 'published') => {
    const ids: bigint[] = [];
    for (let i = 0; i < count; i++) {
      const text = `${tag} ${stamp} প্রশ্ন ${i}`;
      const q = await prisma.questions.create({
        data: {
          body: `<p>${text}</p>`,
          body_text: text,
          options: ['a', 'b', 'c', 'd'].map((key) => ({ key, html: `<p>${key}${i}</p>` })),
          correct_option: 'a',
          difficulty: (i % 5) + 1,
          status: status as 'published',
          primary_node_id: topic,
          content_hash: createHash('sha256').update(text).digest('hex'),
        },
      });
      await prisma.question_tags.createMany({
        data: [category, subject, topic].map((node_id) => ({ question_id: q.id, node_id })),
      });
      ids.push(q.id);
    }
    return ids;
  };
  const examBody = (extra: Record<string, unknown> = {}) => ({
    type: 'live',
    category_id: String(category),
    title_bn: `পরীক্ষা ${stamp}`,
    title_en: `Exam ${stamp}`,
    start_at: new Date(Date.now() + 2 * HOUR).toISOString(),
    end_at: new Date(Date.now() + 4 * HOUR).toISOString(),
    duration_sec: 3600,
    question_count: 6,
    mark_per_question: 1,
    negative_mark: 0.25,
    ...extra,
  });
  const createExam = async (extra: Record<string, unknown> = {}) => {
    const res = await http().post('/v1/admin/exams').set(as(superToken)).send(examBody(extra));
    expect(res.status).toBe(201);
    examIds.push(BigInt(res.body.data.id));
    return res.body.data as { id: string };
  };
  const ready = async (extra: Record<string, unknown> = {}) => {
    const e = await createExam(extra);
    const ids = [...poolA.slice(0, 3), ...poolB.slice(0, 3)].map(String);
    const put = await http()
      .put(`/v1/admin/exams/${e.id}/questions`)
      .set(as(superToken))
      .send({ question_ids: ids });
    expect(put.status).toBe(200);
    return { id: e.id, ids };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await app.get(RateLimitService).reset('');
    superToken = await makeAdmin('super_admin');
    moderatorToken = await makeAdmin('moderator');
    category = await node(null, 'category', 'cat');
    subject = await node(category, 'subject', 'sub');
    topicA = await node(subject, 'topic', 'ta');
    topicB = await node(subject, 'topic', 'tb');
    poolA.push(...(await seedQuestions(topicA, 15, 'A')));
    poolB.push(...(await seedQuestions(topicB, 10, 'B')));
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    await prisma.attempts.deleteMany({ where: { user_id: { in: users.map((u) => u.id) } } });
    await redis.client.del(...examIds.flatMap((id) => [paperKey(id), answerKeyKey(id)]), 'noop');
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    await prisma.questions.deleteMany({ where: { id: { in: [...poolA, ...poolB] } } });
    for (const id of [topicA, topicB, subject, category]) {
      await prisma.taxonomy_nodes.delete({ where: { id } });
    }
    await prisma.audit_logs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.admins.deleteMany({ where: { id: { in: adminIds } } });
    await app.close();
  });

  it('creates a draft with a derived slug and total marks; validates input', async () => {
    const res = await http().post('/v1/admin/exams').set(as(superToken)).send(examBody());
    expect(res.status).toBe(201);
    expectContract(res);
    examIds.push(BigInt(res.body.data.id));
    expect(res.body.data).toMatchObject({
      status: 'draft',
      total_marks: 6,
      paper_questions: 0,
      is_premium: true,
    });
    expect(res.body.data.slug).toBe(`exam-${stamp}-${res.body.data.id}`);

    const notCategory = await http()
      .post('/v1/admin/exams')
      .set(as(superToken))
      .send(examBody({ category_id: String(topicA) }));
    expect(notCategory.status).toBe(400);
    expectContract(notCategory);
    const backwards = await http()
      .post('/v1/admin/exams')
      .set(as(superToken))
      .send(examBody({ end_at: new Date(Date.now() + HOUR).toISOString() }));
    expect(backwards.status).toBe(400);

    const list = await http().get('/v1/admin/exams?limit=5').set(as(superToken));
    expectContract(list);
    const one = await http().get(`/v1/admin/exams/${res.body.data.id}`).set(as(superToken));
    expectContract(one);
    expect((await http().get('/v1/admin/exams/99999999').set(as(superToken))).status).toBe(404);
    expect(
      (await http().post('/v1/admin/exams').set(as(moderatorToken)).send(examBody())).status,
    ).toBe(403);
  });

  describe('generator', () => {
    it('proposes a paper that follows the rules, without saving anything', async () => {
      const e = await createExam({
        question_count: 12,
        blueprint: {
          rules: [
            { node_id: String(topicA), count: 6, difficulty_mix: { easy: 2, medium: 2, hard: 2 } },
            { node_id: String(topicB), count: 6 },
          ],
        },
      });
      const res = await http().post(`/v1/admin/exams/${e.id}/generate`).set(as(superToken));
      expect(res.status).toBe(200);
      expectContract(res);
      const ids = res.body.data.question_ids as string[];
      expect(ids).toHaveLength(12);
      expect(new Set(ids).size).toBe(12);
      expect(res.body.data.shortfalls).toEqual([]);

      const rows = await prisma.questions.findMany({
        where: { id: { in: ids.map(BigInt) } },
        select: { primary_node_id: true, difficulty: true },
      });
      const a = rows.filter((r) => r.primary_node_id === topicA);
      expect(a).toHaveLength(6);
      expect(a.filter((r) => r.difficulty <= 2)).toHaveLength(2);
      expect(a.filter((r) => r.difficulty === 3)).toHaveLength(2);
      expect(a.filter((r) => r.difficulty >= 4)).toHaveLength(2);
      expect(await prisma.exam_questions.count({ where: { exam_id: BigInt(e.id) } })).toBe(0);
    });

    it('reports shortfalls instead of failing, and skips questions from recent exams', async () => {
      const prev = await ready();
      await http().post(`/v1/admin/exams/${prev.id}/publish`).set(as(superToken)).expect(200);

      const e = await createExam({
        question_count: 20,
        blueprint: {
          rules: [{ node_id: String(topicB), count: 9 }],
          exclude_used_in_last_exams: 5,
        },
      });
      const res = await http().post(`/v1/admin/exams/${e.id}/generate`).set(as(superToken));
      const ids = res.body.data.question_ids as string[];
      // topic B has 10 questions, 3 sit in the recent exam: only 7 are eligible
      expect(ids.some((id) => prev.ids.includes(id))).toBe(false);
      expect(ids).toHaveLength(7);
      expect(res.body.data.shortfalls).toEqual([
        { node_id: String(topicB), needed: 9, available: 7 },
      ]);

      const noRules = await createExam();
      expect(
        (await http().post(`/v1/admin/exams/${noRules.id}/generate`).set(as(superToken))).status,
      ).toBe(400);
    });
  });

  describe('paper, publish, freeze', () => {
    it('sets and reads the paper in order, with a subject section per question', async () => {
      const { id, ids } = await ready();
      const paper = await http().get(`/v1/admin/exams/${id}/questions`).set(as(superToken));
      expect(paper.status).toBe(200);
      expectContract(paper);
      expect(paper.body.data.map((p: { question_id: string }) => p.question_id)).toEqual(ids);
      expect(paper.body.data[0]).toMatchObject({ position: 1, section_node_id: String(subject) });

      const tooMany = await http()
        .put(`/v1/admin/exams/${id}/questions`)
        .set(as(superToken))
        .send({ question_ids: [...ids, ...poolA.slice(3, 8).map(String)] });
      expect(tooMany.status).toBe(400);
      const dup = await http()
        .put(`/v1/admin/exams/${id}/questions`)
        .set(as(superToken))
        .send({ question_ids: [ids[0], ids[0]] });
      expect(dup.status).toBe(400);

      const draftQ = (await seedQuestions(topicA, 1, 'D', 'draft'))[0] as bigint;
      poolA.push(draftQ);
      const unpublished = await http()
        .put(`/v1/admin/exams/${id}/questions`)
        .set(as(superToken))
        .send({ question_ids: [String(draftQ)] });
      expect(unpublished.status).toBe(400);
    });

    it('refuses to publish an incomplete or badly timed exam and lists every problem', async () => {
      const e = await createExam({ start_at: new Date(Date.now() - HOUR).toISOString() });
      const res = await http().post(`/v1/admin/exams/${e.id}/publish`).set(as(superToken));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('EXAM_NOT_PUBLISHABLE');
      expect(res.body.error.details.problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('start_at is in the past'),
          expect.stringContaining('paper has 0 questions'),
        ]),
      );
      expectContract(res);
    });

    it('publishes: builds the paper, fills the syllabus, then freezes the exam and its questions', async () => {
      const { id, ids } = await ready();
      expect(
        (await http().post(`/v1/admin/exams/${id}/publish`).set(as(moderatorToken))).status,
      ).toBe(403);
      const pub = await http().post(`/v1/admin/exams/${id}/publish`).set(as(superToken));
      expect(pub.status).toBe(200);
      expect(pub.body.data.status).toBe('scheduled');
      expect(pub.body.data.result_publish_at).not.toBeNull();
      expect(await redis.client.exists(paperKey(id), answerKeyKey(id))).toBe(2);
      const stored = await prisma.exams.findUniqueOrThrow({ where: { id: BigInt(id) } });
      expect(stored.syllabus).toEqual([{ node_id: subject, label: 'sub', questions: 6, marks: 6 }]);

      // paper and scoring rules are frozen
      const body = examBody();
      expect(
        (
          await http()
            .put(`/v1/admin/exams/${id}`)
            .set(as(superToken))
            .send({ ...body, question_count: 7 })
        ).status,
      ).toBe(409);
      const retitle = await http()
        .put(`/v1/admin/exams/${id}`)
        .set(as(superToken))
        .send({ ...body, title_bn: 'নতুন শিরোনাম' });
      expect(retitle.status).toBe(200);
      expectContract(retitle);
      expect(retitle.body.data.title_bn).toBe('নতুন শিরোনাম');
      expect(
        (
          await http()
            .put(`/v1/admin/exams/${id}/questions`)
            .set(as(superToken))
            .send({ question_ids: ids.slice(0, 2) })
        ).status,
      ).toBe(409);

      // a question inside the exam cannot lose its answer or leave "published"
      const qid = ids[0] as string;
      const q = await prisma.questions.findUniqueOrThrow({ where: { id: BigInt(qid) } });
      const editBody = {
        body: q.body,
        options: q.options,
        correct_option: 'b',
        primary_node_id: String(topicA),
        status: 'published',
      };
      const edit = await http()
        .put(`/v1/admin/questions/${qid}`)
        .set(as(superToken))
        .send(editBody);
      expect(edit.status).toBe(409);
      expect(edit.body.error.details.exam_ids).toContain(id);
      const archive = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(superToken))
        .send({ ids: [qid], action: 'archive' });
      expect(archive.status).toBe(409);
      // text-only fix (same answer) is fine
      const fix = await http()
        .put(`/v1/admin/questions/${qid}`)
        .set(as(superToken))
        .send({
          ...editBody,
          correct_option: q.correct_option,
          explanation: '<p>নতুন ব্যাখ্যা</p>',
        });
      expect(fix.status).toBe(200);
    });

    it('unpublish returns to draft and clears the built paper; refused once someone started', async () => {
      const { id } = await ready();
      await http().post(`/v1/admin/exams/${id}/publish`).set(as(superToken)).expect(200);
      const back = await http().post(`/v1/admin/exams/${id}/unpublish`).set(as(superToken));
      expect(back.status).toBe(200);
      expectContract(back);
      expect(back.body.data.status).toBe('draft');
      expect(await redis.client.exists(paperKey(id))).toBe(0);

      await http().post(`/v1/admin/exams/${id}/publish`).set(as(superToken)).expect(200);
      const phone = randomPhone();
      phones.push(phone);
      const user = await registerUser(app, phone);
      await prisma.attempts.create({
        data: {
          user_id: BigInt(user.user.id),
          exam_id: BigInt(id),
          kind: 'live',
          status: 'in_progress',
          started_at: new Date(),
          total_questions: 6,
        },
      });
      const refused = await http().post(`/v1/admin/exams/${id}/unpublish`).set(as(superToken));
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('IN_USE');
    });
  });

  it('monitor counts attempts by state', async () => {
    const e = await createExam();
    const make = async (status: 'in_progress' | 'submitted' | 'scored') => {
      const phone = randomPhone();
      phones.push(phone);
      const user = await registerUser(app, phone);
      await prisma.attempts.create({
        data: {
          user_id: BigInt(user.user.id),
          exam_id: BigInt(e.id),
          kind: 'live',
          status,
          started_at: new Date(),
          total_questions: 6,
        },
      });
    };
    await make('in_progress');
    await make('in_progress');
    await make('submitted');
    await make('scored');
    const res = await http().get(`/v1/admin/exams/${e.id}/monitor`).set(as(superToken));
    expect(res.status).toBe(200);
    expectContract(res);
    expect(res.body.data).toMatchObject({
      joined: 4,
      active_now: 2,
      submitted: 2,
      scored: 1,
      error_rate_pct: 0,
    });
    expect(res.body.data.queue_backlog).toEqual(expect.any(Number));
  });
});
