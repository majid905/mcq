import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { ImportsConsumer } from '../../src/admin/imports/imports.consumer';
import { ImportsService } from '../../src/admin/imports/imports.service';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';

const PASS = 'Admin#Pass-12345';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('contract + integration: uploads and question import', () => {
  jest.setTimeout(420_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let consumer: ImportsConsumer;
  const stamp = Date.now().toString(36);
  const adminIds: number[] = [];
  const nodeIds: number[] = [];
  let editor: { id: number; token: string };
  let other: { id: number; token: string };
  let support: { id: number; token: string };
  let category: number;
  let subject: number;
  let topic: number;

  const http = () => request(app.getHttpServer());
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  /** What the signed upload_url expects: the path+query of our own server. */
  const toLocal = (url: string) => {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  };

  const makeAdmin = async (role: string) => {
    const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: role } });
    const row = await prisma.admins.create({
      data: {
        email: `i${stamp}${adminIds.length}@admin.test`,
        name: `I ${role}`,
        password_hash: await app.get(PasswordService).hash(PASS),
        role_id: roleRow.id,
      },
    });
    adminIds.push(row.id);
    const login = await http()
      .post('/v1/admin/auth/login')
      .send({ email: row.email, password: PASS });
    return { id: row.id, token: login.body.data.access_token as string };
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
        name_bn: `${name} বাংলা`,
        name_en: `${name} ${stamp}`,
        slug: `${name}-${stamp}`,
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
    nodeIds.push(row.id);
    return row.id;
  };

  /** Sign, upload through the real local endpoint, return the upload:// reference. */
  const upload = async (
    token: string,
    fileName: string,
    contentType: string,
    body: Buffer | string,
  ): Promise<string> => {
    const sign = await http()
      .post('/v1/admin/uploads')
      .set(as(token))
      .send({ file_name: fileName, content_type: contentType, purpose: 'import_file' });
    expect(sign.status).toBe(201);
    const put = await http()
      .put(toLocal(sign.body.data.upload_url))
      .set(sign.body.data.headers)
      .send(body);
    expect(put.status).toBe(204);
    return sign.body.data.public_url as string;
  };
  const drain = async () => {
    while ((await consumer.runOnce()) > 0) {
      /* keep going until the stream is empty */
    }
  };
  const job = async (id: string, token = editor.token) => {
    const res = await http().get(`/v1/admin/imports/${id}`).set(as(token));
    expect(res.status).toBe(200);
    expectContract(res);
    return res.body.data;
  };
  const MAPPING = {
    body: 'Question',
    option_a: 'A',
    option_b: 'B',
    option_c: 'C',
    option_d: 'D',
    correct: 'Answer',
    explanation: 'Explanation',
    topic: 'Topic',
    difficulty: 'Difficulty',
  };
  const csv = (rows: string[][]) =>
    [['Question', 'A', 'B', 'C', 'D', 'Answer', 'Explanation', 'Topic', 'Difficulty'], ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  const row = (n: string | number, over: Partial<Record<number, string>> = {}) => {
    const base = [
      `ইমপোর্ট ${stamp} প্রশ্ন ${n}`,
      `ক${n}`,
      `খ${n}`,
      `গ${n}`,
      `ঘ${n}`,
      'B',
      'ব্যাখ্যা',
      `Topic ${stamp}`,
      '2',
    ];
    return base.map((v, i) => over[i] ?? v);
  };
  const run = async (fileId: string, status = 'in_review', token = editor.token) => {
    const v = await http()
      .post(`/v1/admin/imports/${fileId}/validate`)
      .set(as(token))
      .send({ mapping: MAPPING, default_status: status });
    expect(v.status).toBe(202);
    await drain();
    const validated = await job(fileId, token);
    const r = await http().post(`/v1/admin/imports/${fileId}/run`).set(as(token));
    expect(r.status).toBe(202);
    await drain();
    return { validated, done: await job(fileId, token) };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await app.get(RateLimitService).reset('');
    consumer = new ImportsConsumer(redis, app.get(ImportsService));
    await consumer.ensureGroup();
    await drain(); // leftovers from earlier runs
    editor = await makeAdmin('content_manager');
    other = await makeAdmin('content_manager');
    support = await makeAdmin('support');
    category = await node(null, 'category', 'Cat');
    subject = await node(category, 'subject', 'Sub');
    topic = await node(subject, 'topic', 'Topic');
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE o FROM search_outbox o JOIN questions q ON q.id = o.question_id WHERE q.primary_node_id = ${topic}`;
    await prisma.questions.deleteMany({ where: { primary_node_id: topic } });
    for (const id of [...nodeIds].reverse()) {
      await prisma.taxonomy_nodes.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.import_jobs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.audit_logs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.admins.deleteMany({ where: { id: { in: adminIds } } });
    await app.close();
  });

  describe('uploads', () => {
    it('signs, accepts and serves a question image; checks type, permission and signature', async () => {
      const sign = await http()
        .post('/v1/admin/uploads')
        .set(as(editor.token))
        .send({ file_name: 'diagram.PNG', content_type: 'image/png', purpose: 'question_image' });
      expect(sign.status).toBe(201);
      expectContract(sign);
      const { upload_url, public_url } = sign.body.data;
      expect(public_url).toMatch(/\/v1\/files\/images\/\d{4}\/[0-9A-Z]{26}\.png$/);

      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
      const bad = await http()
        .put(`${toLocal(upload_url)}x`)
        .set('Content-Type', 'image/png')
        .send(png);
      expect(bad.status).toBe(403);
      const put = await http().put(toLocal(upload_url)).set('Content-Type', 'image/png').send(png);
      expect(put.status).toBe(204);

      const got = await http().get(new URL(public_url).pathname);
      expect(got.status).toBe(200);
      expect(got.headers['content-type']).toBe('image/png');
      expect(got.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(got.body as Buffer, png)).toBe(0);

      const wrongType = await http()
        .post('/v1/admin/uploads')
        .set(as(editor.token))
        .send({ file_name: 'x.svg', content_type: 'image/svg+xml', purpose: 'question_image' });
      expect(wrongType.status).toBe(400);
      const noRight = await http()
        .post('/v1/admin/uploads')
        .set(as(support.token))
        .send({ file_name: 'x.png', content_type: 'image/png', purpose: 'question_image' });
      expect(noRight.status).toBe(403);
      const bannerNoRight = await http()
        .post('/v1/admin/uploads')
        .set(as(editor.token))
        .send({ file_name: 'x.png', content_type: 'image/png', purpose: 'banner' });
      expect(bannerNoRight.status).toBe(403);
    });

    it('keeps import files private and refuses traversal and unknown files', async () => {
      const ref = await upload(editor.token, 'secret.csv', 'text/csv', 'a,b\n1,2\n');
      expect(ref).toMatch(/^upload:\/\/imports\/\d+\/[0-9A-Z]{26}-secret\.csv$/);
      const key = ref.slice('upload://'.length);
      expect((await http().get(`/v1/files/${key}`)).status).toBe(404);
      expect((await http().get(`/v1/admin/uploads/local/${key}`)).status).toBe(400);
      expect((await http().get('/v1/files/images/..%2f..%2f.env')).status).toBe(404);
      expect((await http().get('/v1/files/images/2026/nothing.png')).status).toBe(404);
    });
  });

  describe('import flow', () => {
    it('previews, validates with per-row errors and duplicates, imports once, and reports', async () => {
      const rows = [
        row(1),
        row(2),
        row(3),
        row(4, { 5: 'Z' }), // bad answer
        row(5, { 7: 'No Such Topic' }), // unknown topic
        row(1), // same question twice in the file
        row(7, { 0: '' }), // empty body
      ];
      const ref = await upload(editor.token, 'batch.csv', 'text/csv', csv(rows));
      const created = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'batch.csv' });
      expect(created.status).toBe(201);
      expectContract(created);
      const data = created.body.data;
      expect(data).toMatchObject({ status: 'uploaded', total_rows: 7 });
      expect(data.columns).toEqual(
        expect.arrayContaining(['Question', 'A', 'B', 'C', 'D', 'Answer', 'Topic']),
      );
      expect(data.preview_rows).toHaveLength(7);
      expect(data.suggested_mapping).toMatchObject({
        body: 'Question',
        correct: 'Answer',
        topic: 'Topic',
      });

      // incomplete mapping is refused before anything is queued
      const partial = await http()
        .post(`/v1/admin/imports/${data.id}/validate`)
        .set(as(editor.token))
        .send({ mapping: { body: 'Question' } });
      expect(partial.status).toBe(400);
      expect(partial.body.error.details.fields.topic).toBe('not mapped');
      expect((await job(data.id)).status).toBe('uploaded');
      // running before validating is refused
      expect(
        (await http().post(`/v1/admin/imports/${data.id}/run`).set(as(editor.token))).status,
      ).toBe(409);

      const validate = await http()
        .post(`/v1/admin/imports/${data.id}/validate`)
        .set(as(editor.token))
        .send({ mapping: MAPPING });
      expect(validate.status).toBe(202);
      await drain();
      const v = await job(data.id);
      expect(v).toMatchObject({
        status: 'validated',
        total_rows: 7,
        valid_rows: 3,
        failed_rows: 3,
        duplicate_rows: 1,
      });
      expect(
        v.row_errors.map((e: { row: number; field: string }) => `${e.row}:${e.field}`),
      ).toEqual(expect.arrayContaining(['5:correct', '6:topic', '8:body']));
      expect(v.error_file_url).toContain('/v1/admin/uploads/local/imports/');

      const report = await http().get(toLocal(v.error_file_url));
      expect(report.status).toBe(200);
      const text = (report.body as Buffer).toString('utf8');
      expect(text).toContain('"failed","correct"');
      expect(text).toContain('"duplicate"');
      expect(text).toContain(`ইমপোর্ট ${stamp} প্রশ্ন 4`); // original columns travel with the error

      const ran = await http().post(`/v1/admin/imports/${data.id}/run`).set(as(editor.token));
      expect(ran.status).toBe(202);
      await drain();
      const done = await job(data.id);
      expect(done).toMatchObject({
        status: 'done',
        imported_rows: 3,
        failed_rows: 3,
        duplicate_rows: 1,
      });
      expect(done.finished_at).not.toBeNull();

      const qs = await prisma.questions.findMany({
        where: { primary_node_id: topic },
        include: { question_tags: true },
      });
      expect(qs).toHaveLength(3);
      expect(qs.every((q) => q.status === 'in_review' && q.created_by === editor.id)).toBe(true);
      expect(qs[0]?.question_tags.map((t) => t.node_id).sort()).toEqual(
        [category, subject, topic].sort(),
      );
      expect(
        await prisma.search_outbox.count({ where: { question_id: { in: qs.map((q) => q.id) } } }),
      ).toBe(3);
      // drafts and in-review questions are not counted as published
      expect(
        (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: topic } })).question_count,
      ).toBe(0);

      // a finished job cannot be run again
      expect(
        (await http().post(`/v1/admin/imports/${data.id}/run`).set(as(editor.token))).status,
      ).toBe(409);

      // importing the same file again adds nothing: everything is a duplicate
      const again = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'batch.csv' });
      const second = await run(again.body.data.id);
      expect(second.validated).toMatchObject({ valid_rows: 0, duplicate_rows: 4 });
      expect(second.done).toMatchObject({ status: 'done', imported_rows: 0 });
      expect(await prisma.questions.count({ where: { primary_node_id: topic } })).toBe(3);

      const list = await http().get('/v1/admin/imports?limit=10').set(as(editor.token));
      expect(list.status).toBe(200);
      expectContract(list);
      expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('reads xlsx with Bangla text, publishes on import and updates counts', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('প্রশ্ন');
      ws.addRow(['Question', 'A', 'B', 'C', 'D', 'Answer', 'Explanation', 'Topic', 'Difficulty']);
      for (const n of [101, 102]) ws.addRow(row(n, { 8: '২' }));
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const before = (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: topic } }))
        .question_count;

      const ref = await upload(editor.token, 'প্রশ্ন.xlsx', XLSX, buf);
      const created = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'প্রশ্ন.xlsx' });
      expect(created.status).toBe(201);
      const { done } = await run(created.body.data.id, 'published');
      expect(done).toMatchObject({ status: 'done', imported_rows: 2 });

      const q = await prisma.questions.findFirstOrThrow({
        where: { primary_node_id: topic, body_text: { contains: ' 101' } },
      });
      expect(q).toMatchObject({ status: 'published', difficulty: 2 });
      expect(q.slug).toBe(`q-${q.id}`);
      expect(q.published_at).not.toBeNull();
      for (const n of [topic, subject, category]) {
        const c = (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: n } }))
          .question_count;
        expect(c).toBe(n === topic ? before + 2 : c);
      }
      expect((await http().get(`/v1/public/questions/q-${q.id}`)).status).toBe(200);
    });

    it('protects other admins files and jobs; refuses bad files', async () => {
      const ref = await upload(editor.token, 'mine.csv', 'text/csv', csv([row(900)]));
      const stolen = await http()
        .post('/v1/admin/imports')
        .set(as(other.token))
        .send({ file_url: ref, file_name: 'mine.csv' });
      expect(stolen.status).toBe(400);

      const created = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'mine.csv' });
      expect(
        (await http().get(`/v1/admin/imports/${created.body.data.id}`).set(as(other.token))).status,
      ).toBe(404);
      expect(
        (await http().get(`/v1/admin/imports/${created.body.data.id}`).set(as(support.token)))
          .status,
      ).toBe(403);
      expect(
        (
          await http()
            .post('/v1/admin/imports')
            .set(as(editor.token))
            .send({ file_url: 'https://evil.example/x.csv', file_name: 'x.csv' })
        ).status,
      ).toBe(400);

      const empty = await upload(editor.token, 'empty.csv', 'text/csv', 'Question,A\n');
      const none = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: empty, file_name: 'empty.csv' });
      expect(none.status).toBe(400);
      const wrongExt = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'mine.pdf' });
      expect(wrongExt.status).toBe(400);
    });

    // The full 50,000 rows run locally and when IMPORT_FULL=1; plain CI uses 5,000 to keep the pipeline short.
    const BIG = process.env['IMPORT_FULL'] || !process.env['CI'] ? 50_000 : 5_000;
    it('imports a large file (50,000 rows) in well under 5 minutes', async () => {
      const rows: string[][] = [];
      for (let i = 0; i < BIG; i++) rows.push(row(`L${i}`, { 8: String((i % 5) + 1) }));
      const ref = await upload(editor.token, 'big.csv', 'text/csv', csv(rows));
      const created = await http()
        .post('/v1/admin/imports')
        .set(as(editor.token))
        .send({ file_url: ref, file_name: 'big.csv' });
      expect(created.status).toBe(201);
      expect(created.body.data.total_rows).toBe(BIG);

      const started = Date.now();
      const { validated, done } = await run(created.body.data.id, 'published');
      const seconds = (Date.now() - started) / 1000;
      process.stdout.write(`50k import: validate+run ${seconds.toFixed(1)}s\n`);
      expect(validated).toMatchObject({ valid_rows: BIG, failed_rows: 0, duplicate_rows: 0 });
      expect(done).toMatchObject({ status: 'done', imported_rows: BIG });
      expect(seconds).toBeLessThan(300);
      expect(
        (await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: category } })).question_count,
      ).toBeGreaterThanOrEqual(BIG);
    });
  });
});
