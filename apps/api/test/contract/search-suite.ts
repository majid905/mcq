import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

export interface SearchHarness {
  app: () => INestApplication;
  /** Called after questions are created/changed so the engine can see them. */
  makeSearchable: (ids: bigint[]) => Promise<void>;
}

/** The behaviour every search driver (Meilisearch, MySQL) must show. */
export function defineSearchTests(h: SearchHarness): void {
  const phones: string[] = [];
  const questionIds: bigint[] = [];
  let prisma: PrismaService;
  let redis: RedisService;

  const http = () => request(h.app().getHttpServer());
  const newUser = async (): Promise<Session> => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(h.app(), phone);
  };
  const token = () => `zq${randomBytes(4).toString('hex')}`;

  const mkQuestion = async (
    word: string,
    extra: { year?: number; node?: number; html?: string } = {},
  ) => {
    const hash = randomBytes(32).toString('hex');
    const body = extra.html ?? `বাংলাদেশের ${word} সম্পর্কে নিচের কোনটি সঠিক?`;
    const q = await prisma.questions.create({
      data: {
        body: `<p>${body}</p>`,
        body_text: body,
        options: [
          { key: 'a', html: 'ক' },
          { key: 'b', html: 'খ' },
          { key: 'c', html: 'গ' },
          { key: 'd', html: 'ঘ' },
        ],
        correct_option: 'c',
        explanation: 'ব্যাখ্যা',
        status: 'published',
        primary_node_id: extra.node ?? 12,
        source_year: extra.year ?? null,
        content_hash: hash,
      },
    });
    questionIds.push(q.id);
    return q;
  };

  const search = (s: Session, qs: string) =>
    http().get(`/v1/search/questions?${qs}`).set(bearer(s.access_token));

  beforeAll(() => {
    prisma = h.app().get(PrismaService);
    redis = h.app().get(RedisService);
  });

  beforeEach(async () => {
    await h.app().get(RateLimitService).reset('');
    const keys = await redis.client.keys('otp:*');
    if (keys.length > 0) await redis.client.del(...keys);
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    await prisma.question_reports.deleteMany({ where: { question_id: { in: questionIds } } });
    await prisma.search_outbox.deleteMany({ where: { question_id: { in: questionIds } } });
    await prisma.questions.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    const keys = [
      ...users.flatMap((u) => [`user:${u.id}:sub`]),
      ...(await redis.client.keys('quota:search:*')),
    ];
    if (keys.length > 0) await redis.client.del(...new Set(keys));
  });

  it('needs a token and a query of at least 2 characters', async () => {
    expect((await http().get('/v1/search/questions?q=ab')).status).toBe(401);
    const s = await newUser();
    expect((await search(s, 'q=a')).status).toBe(400);
    expect((await search(s, '')).status).toBe(400);
  });

  it('finds a question by a word and highlights it (FR-SRCH-01)', async () => {
    const word = token();
    const q = await mkQuestion(word);
    await h.makeSearchable([q.id]);
    const s = await newUser();
    const res = await search(s, `q=${word}`);
    expectContract(res);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const hit = res.body.data[0];
    expect(hit.question.id).toBe(String(q.id));
    expect(hit.highlight).toContain(`<mark>${word}</mark>`);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1 });
    expect(res.body.meta.took_ms).toEqual(expect.any(Number));
  });

  it('escapes HTML in the highlight', async () => {
    const word = token();
    const q = await mkQuestion(word, { html: `${word} <script>alert(1)</script> & more` });
    await h.makeSearchable([q.id]);
    const s = await newUser();
    const res = await search(s, `q=${word}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].highlight).not.toContain('<script>');
    expect(res.body.data[0].highlight).toContain('&lt;script&gt;');
    expect(res.body.data[0].highlight).toContain(`<mark>${word}</mark>`);
  });

  it('filters by year, topic and category', async () => {
    const word = token();
    const a = await mkQuestion(word, { year: 2019 });
    const b = await mkQuestion(word, { year: 2021 });
    await h.makeSearchable([a.id, b.id]);
    const s = await newUser();
    const ids = async (qs: string) =>
      ((await search(s, qs)).body.data as { question: { id: string } }[])
        .map((x) => x.question.id)
        .sort();

    expect(await ids(`q=${word}`)).toEqual([String(a.id), String(b.id)].sort());
    expect(await ids(`q=${word}&year=2019`)).toEqual([String(a.id)]);
    expect(await ids(`q=${word}&node_id=12`)).toHaveLength(2);
    expect(await ids(`q=${word}&node_id=13`)).toEqual([]); // sibling topic
    const topic = await prisma.taxonomy_nodes.findUniqueOrThrow({ where: { id: 12 } });
    const cat = topic.path.split('/')[1];
    expect(await ids(`q=${word}&category_id=${cat}`)).toHaveLength(2);
    const other = cat === '1' ? '2' : '1';
    expect(await ids(`q=${word}&category_id=${other}`)).toEqual([]);
    const checked = await search(s, `q=${word}&year=2019`);
    expectContract(checked);
  });

  it('pages results', async () => {
    const word = token();
    const made = [await mkQuestion(word), await mkQuestion(word), await mkQuestion(word)];
    await h.makeSearchable(made.map((m) => m.id));
    const s = await newUser();
    const p1 = await search(s, `q=${word}&limit=2&page=1`);
    const p2 = await search(s, `q=${word}&limit=2&page=2`);
    expectContract(p1);
    expect(p1.body.data).toHaveLength(2);
    expect(p2.body.data).toHaveLength(1);
    expect(p1.body.meta.total).toBe(3);
    const all = [...p1.body.data, ...p2.body.data].map(
      (x: { question: { id: string } }) => x.question.id,
    );
    expect(new Set(all).size).toBe(3);
  });

  it('free users see only a few answers per day, counted per distinct question (FR-SRCH-02)', async () => {
    const word = token();
    const made = [];
    for (let i = 0; i < 12; i++) made.push(await mkQuestion(word));
    await h.makeSearchable(made.map((m) => m.id));

    const s = await newUser();
    const first = await search(s, `q=${word}&limit=12`);
    expectContract(first);
    const open = (r: typeof first) =>
      (r.body.data as { question: { answer_locked: boolean; id: string } }[])
        .filter((x) => !x.question.answer_locked)
        .map((x) => x.question.id)
        .sort();
    expect(open(first)).toHaveLength(10);
    const locked = (
      first.body.data as { question: { answer_locked: boolean; correct_option: unknown } }[]
    ).filter((x) => x.question.answer_locked);
    expect(locked).toHaveLength(2);
    expect(locked.every((x) => x.question.correct_option === null)).toBe(true);

    // The same search again costs nothing and shows the same ten.
    const again = await search(s, `q=${word}&limit=12`);
    expect(open(again)).toEqual(open(first));

    // Someone else has their own allowance.
    const other = await newUser();
    expect(open(await search(other, `q=${word}&limit=12`))).toHaveLength(10);

    // A subscriber sees every answer.
    await prisma.subscriptions.create({
      data: {
        user_id: BigInt(s.user.id),
        source: 'manual',
        starts_at: new Date(Date.now() - 3600_000),
        ends_at: new Date(Date.now() + 86_400_000),
      },
    });
    await redis.client.del(`user:${s.user.id}:sub`);
    expect(open(await search(s, `q=${word}&limit=12`))).toHaveLength(12);
    await prisma.subscriptions.deleteMany({ where: { user_id: BigInt(s.user.id) } });
  });

  it('limits a user to 30 searches a minute', async () => {
    const s = await newUser();
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await search(s, 'q=ab')).status;
    expect(last).toBe(429);
  });
}
