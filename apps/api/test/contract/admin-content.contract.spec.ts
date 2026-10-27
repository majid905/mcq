import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { ModerationAdminService } from '../../src/admin/content/moderation-admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser } from './helpers';

const PASS = 'Admin#Pass-12345';

describe('contract + integration: admin questions, taxonomy, reports, broadcast', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now().toString(36);
  const adminIds: number[] = [];
  const phones: string[] = [];
  const nodeIds: number[] = [];
  jest.setTimeout(120_000);
  const questionIds: bigint[] = [];
  const broadcastTitles: string[] = [];
  let superToken: string;
  let moderatorToken: string;
  let editorToken: string;
  let supportToken: string;
  let category: string;
  let subject: string;
  let topicA: string;
  let topicB: string;

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const opts = (...texts: string[]) =>
    texts.map((t, i) => ({ key: 'abcde'[i], html: `<p>${t}</p>` }));
  const q = (n: string, extra: Record<string, unknown> = {}) => ({
    body: `<p>প্রশ্ন ${stamp} ${n} — বাংলাদেশের স্বাধীনতা কবে?</p>`,
    options: opts(`ক${n}`, `খ${n}`, `গ${n}`, `ঘ${n}`),
    correct_option: 'b',
    explanation: '<p>ব্যাখ্যা</p>',
    primary_node_id: topicA,
    ...extra,
  });
  const makeAdmin = async (role: string) => {
    const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: role } });
    const row = await prisma.admins.create({
      data: {
        email: `c${stamp}${adminIds.length}@admin.test`,
        name: `C ${role}`,
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
  const createQuestion = async (n: string, extra: Record<string, unknown> = {}) => {
    const res = await http().post('/v1/admin/questions').set(as(editorToken)).send(q(n, extra));
    expect(res.status).toBe(201);
    questionIds.push(BigInt(res.body.data.id));
    return res.body.data as { id: string };
  };
  const nodeCount = async (id: string) =>
    (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: Number(id) } })).question_count;
  const node = async (body: Record<string, unknown>) => {
    const res = await http().post('/v1/admin/taxonomy').set(as(superToken)).send(body);
    if (res.status === 201) nodeIds.push(Number(res.body.data.id));
    return res;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await app.get(RateLimitService).reset('');
    superToken = await makeAdmin('super_admin');
    moderatorToken = await makeAdmin('moderator');
    editorToken = await makeAdmin('content_manager');
    supportToken = await makeAdmin('support');
    category = (
      await node({ type: 'category', name_bn: 'টেস্ট ক্যাটাগরি', name_en: `Test Cat ${stamp}` })
    ).body.data.id;
    subject = (
      await node({ parent_id: category, type: 'subject', name_bn: 'বিষয়', name_en: 'Subject' })
    ).body.data.id;
    topicA = (
      await node({ parent_id: subject, type: 'topic', name_bn: 'টপিক ক', name_en: 'Topic A' })
    ).body.data.id;
    topicB = (
      await node({ parent_id: subject, type: 'topic', name_bn: 'টপিক খ', name_en: 'Topic B' })
    ).body.data.id;
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    const uids = users.map((u) => u.id);
    await prisma.notifications.deleteMany({
      where: { OR: [{ user_id: { in: uids } }, { title: { in: broadcastTitles } }] },
    });
    await prisma.question_reports.deleteMany({ where: { question_id: { in: questionIds } } });
    await prisma.search_outbox.deleteMany({ where: { question_id: { in: questionIds } } });
    await prisma.questions.deleteMany({ where: { id: { in: questionIds } } });
    const root = await prisma.taxonomy_nodes.findUnique({ where: { id: Number(category) } });
    const tree = root
      ? await prisma.taxonomy_nodes.findMany({
          where: { path: { startsWith: root.path } },
          orderBy: { depth: 'desc' },
        })
      : [];
    for (const n of tree) await prisma.taxonomy_nodes.delete({ where: { id: n.id } });
    await prisma.audit_logs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.admins.deleteMany({ where: { id: { in: adminIds } } });
    await app.close();
  });

  describe('questions', () => {
    it('creates a draft tagged with every ancestor and queues it for search', async () => {
      const res = await http().post('/v1/admin/questions').set(as(editorToken)).send(q('1'));
      expect(res.status).toBe(201);
      expectContract(res);
      questionIds.push(BigInt(res.body.data.id));
      expect(res.body.data).toMatchObject({ status: 'draft', primary_node_id: topicA });
      expect(res.body.data.node_ids).toEqual(expect.arrayContaining([category, subject, topicA]));
      expect(res.body.meta.near_duplicates).toEqual([]);
      expect(await nodeCount(topicA)).toBe(0); // drafts are not counted
      const outbox = await prisma.search_outbox.count({
        where: { question_id: BigInt(res.body.data.id) },
      });
      expect(outbox).toBe(1);
    });

    it('rejects exact duplicates, bad content and unknown nodes; strips unsafe HTML', async () => {
      const first = await createQuestion('2');
      const dup = await http().post('/v1/admin/questions').set(as(editorToken)).send(q('2'));
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('DUPLICATE_QUESTION');
      expect(dup.body.error.details.existing_id).toBe(first.id);
      expectContract(dup);

      const badKey = await http()
        .post('/v1/admin/questions')
        .set(as(editorToken))
        .send(q('3', { correct_option: 'e' }));
      expect(badKey.status).toBe(400);
      expectContract(badKey);
      const badNode = await http()
        .post('/v1/admin/questions')
        .set(as(editorToken))
        .send(q('4', { primary_node_id: '999999999' }));
      expect(badNode.status).toBe(400);

      const evil = await createQuestion('5', {
        body: `<p onclick="x()">প্রশ্ন ${stamp} 5<script>alert(1)</script></p><img src="http://evil/x.png">`,
      });
      const stored = await prisma.questions.findUniqueOrThrow({ where: { id: BigInt(evil.id) } });
      expect(stored.body).not.toMatch(/script|onclick|http:/);
    });

    it('flags near duplicates without blocking', async () => {
      await createQuestion('6', {
        body: `<p>একই শুরু একই শুরু একই শুরু একই শুরু একই শুরু একই শুরু ${stamp} প্রথম</p>`,
      });
      const res = await http()
        .post('/v1/admin/questions')
        .set(as(editorToken))
        .send(
          q('7', {
            body: `<p>একই শুরু একই শুরু একই শুরু একই শুরু একই শুরু একই শুরু ${stamp} দ্বিতীয়</p>`,
          }),
        );
      expect(res.status).toBe(201);
      questionIds.push(BigInt(res.body.data.id));
      expect(res.body.meta.near_duplicates).toHaveLength(1);
    });

    it('publishing counts it, exposes it publicly and a later edit keeps tags in step', async () => {
      const created = await createQuestion('8');
      const base = { ...q('8'), status: 'published', node_ids: [topicB] };
      const upd = await http()
        .put(`/v1/admin/questions/${created.id}`)
        .set(as(editorToken))
        .send(base);
      expect(upd.status).toBe(200);
      expectContract(upd);
      expect(upd.body.data.status).toBe('published');
      expect(await nodeCount(topicA)).toBe(1);
      expect(await nodeCount(topicB)).toBe(1);
      expect(await nodeCount(subject)).toBe(1);

      const stored = await prisma.questions.findUniqueOrThrow({
        where: { id: BigInt(created.id) },
      });
      expect(stored.slug).toBe(`q-${created.id}`);
      expect(stored.published_at).not.toBeNull();
      const pub = await http().get(`/v1/public/questions/q-${created.id}`);
      expect(pub.status).toBe(200);

      // dropping topic B again recounts it
      const back = await http()
        .put(`/v1/admin/questions/${created.id}`)
        .set(as(editorToken))
        .send({ ...base, node_ids: [] });
      expect(back.status).toBe(200);
      expect(await nodeCount(topicB)).toBe(0);
      expect(await nodeCount(topicA)).toBe(1);

      const archived = await http()
        .put(`/v1/admin/questions/${created.id}`)
        .set(as(editorToken))
        .send({ ...base, status: 'archived', node_ids: [] });
      expect(archived.status).toBe(200);
      expect(await nodeCount(topicA)).toBe(0);
      expect((await http().get(`/v1/public/questions/q-${created.id}`)).status).toBe(404);
    });

    it('lists with filters and cursor, and reads one', async () => {
      const a = await createQuestion('9');
      await createQuestion('10');
      const list = await http()
        .get(`/v1/admin/questions?node_id=${topicA}&status=draft&limit=2`)
        .set(as(editorToken));
      expect(list.status).toBe(200);
      expectContract(list);
      expect(list.body.data).toHaveLength(2);
      expect(list.body.meta.has_more).toBe(true);

      const byText = await http()
        .get(`/v1/admin/questions?q=${encodeURIComponent(`${stamp} 9`)}`)
        .set(as(moderatorToken));
      expect(byText.status).toBe(200);
      expect(byText.body.data.map((x: { id: string }) => x.id)).toContain(a.id);

      const one = await http().get(`/v1/admin/questions/${a.id}`).set(as(moderatorToken));
      expectContract(one);
      expect(
        (await http().get('/v1/admin/questions/999999999999').set(as(editorToken))).status,
      ).toBe(404);
      expect((await http().get('/v1/admin/questions').set(as(supportToken))).status).toBe(403);
    });

    it('bulk: status moves by editors and moderators, tag changes by editors only', async () => {
      const ids = [(await createQuestion('11')).id, (await createQuestion('12')).id];
      const before = await nodeCount(topicA);

      const forbidden = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(supportToken))
        .send({ ids, action: 'publish' });
      expect(forbidden.status).toBe(403);

      const pub = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(moderatorToken))
        .send({ ids, action: 'publish' });
      expect(pub.status).toBe(200);
      expectContract(pub);
      expect(pub.body.data.affected).toBe(2);
      expect(await nodeCount(topicA)).toBe(before + 2);

      const modTag = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(moderatorToken))
        .send({ ids, action: 'add_tag', node_id: topicB });
      expect(modTag.status).toBe(403);

      const add = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(editorToken))
        .send({ ids, action: 'add_tag', node_id: topicB });
      expect(add.status).toBe(200);
      expect(await nodeCount(topicB)).toBe(2);

      // removing the primary topic's own tag is silently skipped, an extra tag is removed
      await http()
        .post('/v1/admin/questions/bulk')
        .set(as(editorToken))
        .send({ ids, action: 'remove_tag', node_id: topicA });
      expect(await nodeCount(topicA)).toBe(before + 2);
      await http()
        .post('/v1/admin/questions/bulk')
        .set(as(editorToken))
        .send({ ids, action: 'remove_tag', node_id: topicB });
      expect(await nodeCount(topicB)).toBe(0);

      const arch = await http()
        .post('/v1/admin/questions/bulk')
        .set(as(editorToken))
        .send({ ids, action: 'archive' });
      expect(arch.body.data.affected).toBe(2);
      expect(await nodeCount(topicA)).toBe(before);

      expect(
        (
          await http()
            .post('/v1/admin/questions/bulk')
            .set(as(editorToken))
            .send({ ids, action: 'add_tag' })
        ).status,
      ).toBe(400);
    });
  });

  describe('taxonomy', () => {
    it('enforces the hierarchy and unique slugs', async () => {
      const rootTopic = await node({ type: 'topic', name_bn: 'x', name_en: 'x' });
      expect(rootTopic.status).toBe(400);
      expectContract(rootTopic);
      const wrongLevel = await node({
        parent_id: subject,
        type: 'subject',
        name_bn: 'x',
        name_en: 'x',
      });
      expect(wrongLevel.status).toBe(400);

      const dup = await node({
        parent_id: subject,
        type: 'topic',
        name_bn: 'আবার',
        name_en: 'Again',
        slug: 'topic-a',
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');

      const ok = await node({
        parent_id: subject,
        type: 'topic',
        name_bn: 'গ',
        name_en: 'Topic C',
      });
      expect(ok.status).toBe(201);
      expectContract(ok);
      expect(ok.body.data.slug).toBe('topic-c');
      const row = await prisma.taxonomy_nodes.findUniqueOrThrow({
        where: { id: Number(ok.body.data.id) },
      });
      expect(row.path).toBe(
        `${(await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: Number(subject) } })).path}${row.id}/`,
      );
      expect(row.depth).toBe(2);

      expect(
        (
          await http()
            .post('/v1/admin/taxonomy')
            .set(as(editorToken))
            .send({ parent_id: subject, type: 'topic', name_bn: 'ঘ', name_en: 'D' })
        ).status,
      ).toBe(201); // content_manager holds taxonomy.write
      expect(
        (
          await http()
            .post('/v1/admin/taxonomy')
            .set(as(supportToken))
            .send({ parent_id: subject, type: 'topic', name_bn: 'ঙ', name_en: 'E' })
        ).status,
      ).toBe(403);
    });

    it('updates names, refuses to change type or parent, and deletes only empty leaves', async () => {
      const t = (await node({ parent_id: subject, type: 'topic', name_bn: 'মুছব', name_en: 'Del' }))
        .body.data;
      const upd = await http()
        .put(`/v1/admin/taxonomy/${t.id}`)
        .set(as(superToken))
        .send({ parent_id: subject, type: 'topic', name_bn: 'নতুন নাম', name_en: 'Renamed' });
      expect(upd.status).toBe(200);
      expectContract(upd);
      expect(upd.body.data.name_bn).toBe('নতুন নাম');

      const move = await http()
        .put(`/v1/admin/taxonomy/${t.id}`)
        .set(as(superToken))
        .send({ parent_id: category, type: 'topic', name_bn: 'x', name_en: 'x' });
      expect(move.status).toBe(400);

      const withKids = await http().delete(`/v1/admin/taxonomy/${subject}`).set(as(superToken));
      expect(withKids.status).toBe(409);
      expect(withKids.body.error.code).toBe('IN_USE');
      const q1 = await createQuestion('13', { primary_node_id: t.id });
      const withQuestions = await http().delete(`/v1/admin/taxonomy/${t.id}`).set(as(superToken));
      expect(withQuestions.status).toBe(409);
      await prisma.questions.delete({ where: { id: BigInt(q1.id) } });

      const del = await http().delete(`/v1/admin/taxonomy/${t.id}`).set(as(superToken));
      expect(del.status).toBe(204);
      nodeIds.splice(nodeIds.indexOf(Number(t.id)), 1);
      expect((await http().delete(`/v1/admin/taxonomy/${t.id}`).set(as(superToken))).status).toBe(
        404,
      );
    });

    it('reorders, moves an empty subtree (paths follow) and blocks unsafe moves', async () => {
      const sub2 = (
        await node({
          parent_id: category,
          type: 'subject',
          name_bn: 'বিষয় ২',
          name_en: 'Subject 2',
        })
      ).body.data;
      const mover = (
        await node({ parent_id: subject, type: 'topic', name_bn: 'মুভার', name_en: 'Mover' })
      ).body.data;

      const swap = await http()
        .post('/v1/admin/taxonomy/reorder')
        .set(as(superToken))
        .send({
          items: [
            { id: topicA, parent_id: subject, sort_order: 2 },
            { id: topicB, parent_id: subject, sort_order: 1 },
          ],
        });
      expect(swap.status).toBe(204);
      expect(
        (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: Number(topicA) } }))
          .sort_order,
      ).toBe(2);

      const moved = await http()
        .post('/v1/admin/taxonomy/reorder')
        .set(as(superToken))
        .send({ items: [{ id: mover.id, parent_id: sub2.id, sort_order: 0 }] });
      expect(moved.status).toBe(204);
      const row = await prisma.taxonomy_nodes.findUniqueOrThrow({
        where: { id: Number(mover.id) },
      });
      const parent = await prisma.taxonomy_nodes.findUniqueOrThrow({
        where: { id: Number(sub2.id) },
      });
      expect(row.parent_id).toBe(parent.id);
      expect(row.path).toBe(`${parent.path}${row.id}/`);

      // topic A has questions tagged: cannot be moved
      await createQuestion('14');
      const blocked = await http()
        .post('/v1/admin/taxonomy/reorder')
        .set(as(superToken))
        .send({ items: [{ id: topicA, parent_id: sub2.id, sort_order: 0 }] });
      expect(blocked.status).toBe(409);

      // a node cannot go under its own descendant
      const cycle = await http()
        .post('/v1/admin/taxonomy/reorder')
        .set(as(superToken))
        .send({ items: [{ id: category, parent_id: topicB, sort_order: 0 }] });
      expect(cycle.status).toBe(400);
      expectContract(cycle);
    });
  });

  describe('reports and broadcast', () => {
    it('lists open reports, resolves once, and thanks the reporter only when accepted', async () => {
      const qn = await createQuestion('15');
      await prisma.questions.update({
        where: { id: BigInt(qn.id) },
        data: { status: 'published' },
      });
      const phone = randomPhone();
      phones.push(phone);
      const user = await registerUser(app, phone);
      expect(
        (
          await http()
            .post(`/v1/questions/${qn.id}/reports`)
            .set(bearer(user.access_token))
            .send({ reason: 'typo', message: 'ভুল বানান' })
        ).status,
      ).toBe(201);

      const list = await http().get('/v1/admin/reports?limit=100').set(as(moderatorToken));
      expect(list.status).toBe(200);
      expectContract(list);
      const mine = (
        list.body.data as { id: string; question: { id: string }; reporter_name: string }[]
      ).find((r) => r.question.id === qn.id);
      expect(mine?.reporter_name).toBe('রাকিব হাসান');

      expect(
        (
          await http()
            .post(`/v1/admin/reports/${mine?.id}/resolve`)
            .set(as(editorToken))
            .send({ status: 'accepted' })
        ).status,
      ).toBe(403);
      const ok = await http()
        .post(`/v1/admin/reports/${mine?.id}/resolve`)
        .set(as(moderatorToken))
        .send({ status: 'accepted', note: 'ঠিক করা হয়েছে' });
      expect(ok.status).toBe(200);
      const again = await http()
        .post(`/v1/admin/reports/${mine?.id}/resolve`)
        .set(as(moderatorToken))
        .send({ status: 'rejected' });
      expect(again.status).toBe(409);

      const notice = await prisma.notifications.findMany({
        where: { user_id: BigInt(user.user.id), type: 'report' },
      });
      expect(notice).toHaveLength(1);
      const gone = await http().get('/v1/admin/reports').set(as(moderatorToken));
      expect((gone.body.data as { id: string }[]).some((r) => r.id === mine?.id)).toBe(false);
    });

    it('broadcasts to everyone as one inbox row; segments reach the right users', async () => {
      const title = `T${stamp} ঘোষণা`;
      broadcastTitles.push(title);
      const res = await http()
        .post('/v1/admin/notifications/broadcast')
        .set(as(superToken))
        .send({ title, body: 'সবার জন্য', segment: 'all' });
      expect(res.status).toBe(202);
      const rows = await prisma.notifications.findMany({ where: { title } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_id: null, type: 'broadcast' });

      const free = randomPhone();
      const paid = randomPhone();
      phones.push(free, paid);
      const freeUser = await registerUser(app, free);
      const paidUser = await registerUser(app, paid);
      await prisma.subscriptions.create({
        data: {
          user_id: BigInt(paidUser.user.id),
          source: 'manual',
          starts_at: new Date(Date.now() - 1000),
          ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      const segTitle = `T${stamp} শুধু ফ্রি`;
      broadcastTitles.push(segTitle);
      const seg = await http()
        .post('/v1/admin/notifications/broadcast')
        .set(as(superToken))
        .send({ title: segTitle, body: 'ফ্রি ব্যবহারকারী', segment: 'free' });
      expect(seg.status).toBe(202);
      await app.get(ModerationAdminService).idle();
      const delivered = await prisma.notifications.count({
        where: { title: segTitle, user_id: BigInt(freeUser.user.id) },
      });
      expect(delivered).toBe(1);
      expect(
        await prisma.notifications.count({
          where: { title: segTitle, user_id: BigInt(paidUser.user.id) },
        }),
      ).toBe(0);

      // content editors may not broadcast
      expect(
        (
          await http()
            .post('/v1/admin/notifications/broadcast')
            .set(as(editorToken))
            .send({ title: 'x', body: 'y' })
        ).status,
      ).toBe(403);
    });
  });
});
