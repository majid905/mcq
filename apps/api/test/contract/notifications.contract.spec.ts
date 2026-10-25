import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AttemptsService } from '../../src/attempts/attempts.service';
import { MeritService } from '../../src/attempts/merit.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { ExamJobsService } from '../../src/exams/exam-jobs.service';
import { PaperService } from '../../src/exams/paper.service';
import { NotificationService } from '../../src/notifications/notification.service';
import {
  ConsolePushSender,
  PUSH_SENDER,
  type PushOutcome,
  type PushSender,
} from '../../src/notifications/push.sender';
import { examReminder } from '../../src/notifications/templates';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

describe('contract + integration: notifications, preferences, push, reminders', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let notifications: NotificationService;
  let push: ConsolePushSender;
  const phones: string[] = [];
  const examIds: bigint[] = [];
  const broadcastIds: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async (): Promise<Session> => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(app, phone);
  };
  const inbox = (s: Session, qs = '') =>
    http().get(`/v1/notifications${qs}`).set(bearer(s.access_token));
  /** Broadcasts are shared by every user, so tests that count look at personal rows only. */
  const personal = async (s: Session) =>
    ((await inbox(s)).body.data as { type: string; title: string; body: string }[]).filter(
      (n) => n.type !== 'broadcast',
    );
  const addDevice = (userId: string, token: string) =>
    prisma.user_devices.create({
      data: {
        user_id: BigInt(userId),
        device_id: `push-${token}`,
        kind: 'mobile',
        platform: 'android',
        push_token: token,
      },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    notifications = app.get(NotificationService);
    push = app.get<ConsolePushSender>(PUSH_SENDER);
  });

  beforeEach(async () => {
    push.sent.length = 0;
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
    await prisma.notifications.deleteMany({ where: { id: { in: broadcastIds } } });
    await prisma.notifications.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.exams.deleteMany({ where: { id: { in: examIds } } });
    const keys = [
      ...ids.flatMap((id) => [`noti:read:${id}`, `noti:readall:${id}`]),
      ...examIds.flatMap((id) => [
        `remind:${id}:15:done`,
        `remind:${id}:15:cursor`,
        `remind:${id}:1:done`,
        `remind:${id}:1:cursor`,
      ]),
    ];
    if (keys.length > 0) await redis.client.del(...keys);
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });

  describe('preferences (FR-NOTI-03)', () => {
    it('GET gives the defaults, PUT changes only what is sent and persists', async () => {
      const s = await newUser();
      const get = await http().get('/v1/notifications/preferences').set(bearer(s.access_token));
      expectContract(get);
      expect(get.body.data).toEqual({
        exam_reminder: true,
        result: true,
        subscription: true,
        promotional: true,
      });
      const put = await http()
        .put('/v1/notifications/preferences')
        .set(bearer(s.access_token))
        .send({ promotional: false, exam_reminder: false });
      expectContract(put);
      expect(put.body.data).toEqual({
        exam_reminder: false,
        result: true,
        subscription: true,
        promotional: false,
      });
      const again = await http().get('/v1/notifications/preferences').set(bearer(s.access_token));
      expect(again.body.data.exam_reminder).toBe(false);
      expect(
        (
          await http()
            .put('/v1/notifications/preferences')
            .set(bearer(s.access_token))
            .send({ result: 'yes' })
        ).status,
      ).toBe(400);
    });
  });

  describe('inbox (FR-NOTI-02)', () => {
    it('lists personal and broadcast notifications newest first with unread_count and paging', async () => {
      const s = await newUser();
      const uid = BigInt(s.user.id);
      const t0 = Date.now();
      const mk = (title: string, ageMs: number, personal = true) =>
        prisma.notifications.create({
          data: {
            user_id: personal ? uid : null,
            type: personal ? 'result' : 'broadcast',
            title,
            body: `${title} body`,
            deep_link: personal ? '/exams/1' : null,
            created_at: new Date(t0 - ageMs),
          },
        });
      const a = await mk('A', 3000);
      const b = await mk('B', 2000, false);
      const c = await mk('C', 1000);
      broadcastIds.push(b.id);

      const res = await inbox(s);
      expectContract(res);
      expect(res.status).toBe(200);
      expect(res.body.data.map((n: { title: string }) => n.title).slice(0, 3)).toEqual([
        'C',
        'B',
        'A',
      ]);
      expect(res.body.data[0]).toMatchObject({
        read: false,
        deep_link: '/exams/1',
        type: 'result',
      });
      expect(res.body.meta.unread_count).toBeGreaterThanOrEqual(3);

      const p1 = await inbox(s, '?limit=2');
      expect(p1.body.data).toHaveLength(2);
      expect(p1.body.meta.has_more).toBe(true);
      const p2 = await inbox(s, `?limit=2&cursor=${p1.body.meta.next_cursor}`);
      expectContract(p2);
      expect(p2.body.data[0].title).toBe('A');
      expect((await inbox(s, '?cursor=zz')).status).toBe(400);

      // Mark one personal and the broadcast as read.
      await http()
        .post('/v1/notifications/read')
        .set(bearer(s.access_token))
        .send({ ids: [String(c.id), String(b.id)] })
        .expect(204);
      const after = await inbox(s);
      const state = Object.fromEntries(
        after.body.data.map((n: { title: string; read: boolean }) => [n.title, n.read]),
      );
      expect(state).toMatchObject({ C: true, B: true, A: false });
      expect(after.body.meta.unread_count).toBe(res.body.meta.unread_count - 2);

      // A broadcast read by one user is still unread for another.
      const other = await newUser();
      const theirs = await inbox(other);
      expect(theirs.body.data.find((n: { title: string }) => n.title === 'B').read).toBe(false);

      await http()
        .post('/v1/notifications/read')
        .set(bearer(s.access_token))
        .send({ all: true })
        .expect(204);
      const done = await inbox(s);
      expect(done.body.meta.unread_count).toBe(0);
      expect(done.body.data.every((n: { read: boolean }) => n.read)).toBe(true);
      void a;
    });

    it("cannot mark another user's notification read", async () => {
      const s = await newUser();
      const other = await newUser();
      const n = await prisma.notifications.create({
        data: { user_id: BigInt(other.user.id), type: 'system', title: 'x', body: 'y' },
      });
      await http()
        .post('/v1/notifications/read')
        .set(bearer(s.access_token))
        .send({ ids: [String(n.id)] })
        .expect(204);
      expect(
        (await prisma.notifications.findUniqueOrThrow({ where: { id: n.id } })).read_at,
      ).toBeNull();
    });
  });

  describe('sending (FR-NOTI-01)', () => {
    it('writes the inbox row in the user language and pushes to every active device', async () => {
      const s = await newUser();
      await http().patch('/v1/me').set(bearer(s.access_token)).send({ locale: 'en' }).expect(200);
      await addDevice(s.user.id, `tok-a-${s.user.id}`);
      await addDevice(s.user.id, `tok-b-${s.user.id}`);
      await prisma.user_devices.create({
        data: {
          user_id: BigInt(s.user.id),
          device_id: 'off',
          kind: 'mobile',
          platform: 'ios',
          push_token: 'inactive-token',
          is_active: false,
        },
      });
      const exam = { id: 7n, title_bn: 'বিসিএস', title_en: 'BCS' };
      const n = await notifications.notifyMany([BigInt(s.user.id)], examReminder(exam, 15));
      expect(n).toBe(1);

      const list = await inbox(s);
      expect(list.body.data[0]).toMatchObject({
        type: 'exam_reminder',
        title: 'Exam starting soon',
        deep_link: '/exams/7',
      });
      expect(list.body.data[0].body).toContain('15 minutes');
      const targets = push.sent.map((p) => p.target).sort();
      expect(targets).toEqual([`token:tok-a-${s.user.id}`, `token:tok-b-${s.user.id}`]);
      expect(push.sent[0]?.msg.title).toBe('Exam starting soon');
    });

    it('respects the preference switches', async () => {
      const s = await newUser();
      await addDevice(s.user.id, `tok-p-${s.user.id}`);
      await http()
        .put('/v1/notifications/preferences')
        .set(bearer(s.access_token))
        .send({ exam_reminder: false })
        .expect(200);
      const exam = { id: 8n, title_bn: 'ব্যাংক', title_en: 'Bank' };
      expect(await notifications.notifyMany([BigInt(s.user.id)], examReminder(exam, 1))).toBe(0);
      expect(push.sent).toHaveLength(0);
      expect(await personal(s)).toHaveLength(0);
    });

    it('drops push tokens the provider reports as dead', async () => {
      const s = await newUser();
      const device = await addDevice(s.user.id, `tok-dead-${s.user.id}`);
      const dead: PushSender = {
        sendToToken: (): Promise<PushOutcome> => Promise.resolve('invalid_token'),
        sendToTopic: (): Promise<PushOutcome> => Promise.resolve('sent'),
      };
      const svc = new NotificationService(prisma, redis, dead);
      await svc.notify(
        BigInt(s.user.id),
        examReminder({ id: 9n, title_bn: 'x', title_en: 'x' }, 1),
      );
      const row = await prisma.user_devices.findUniqueOrThrow({ where: { id: device.id } });
      expect(row.push_token).toBeNull();
      // The inbox row stays: push is best effort.
      expect(await personal(s)).toHaveLength(1);
    });

    it('a broadcast shows up for everyone and goes to a topic', async () => {
      const s = await newUser();
      await notifications.broadcast(
        {
          type: 'broadcast',
          bn: { title: 'নতুন ফিচার', body: 'দেখুন' },
          en: { title: 'New feature', body: 'See it' },
        },
        'all',
      );
      const mine = await prisma.notifications.findFirstOrThrow({
        where: { user_id: null, title: 'নতুন ফিচার' },
        orderBy: { id: 'desc' },
      });
      broadcastIds.push(mine.id);
      expect(push.sent.at(-1)?.target).toBe('topic:all');
      const list = await inbox(s);
      expect(list.body.data.map((n: { id: string }) => n.id)).toContain(String(mine.id));
    });
  });

  describe('exam reminders (FR-EXAM-02)', () => {
    const mkExam = async (startInMs: number) => {
      const now = Date.now();
      const e = await prisma.exams.create({
        data: {
          type: 'live',
          category_id: 5,
          title_bn: 'রিমাইন্ডার পরীক্ষা',
          title_en: 'Reminder exam',
          slug: `rem-${now}-${Math.random().toString(36).slice(2, 6)}`,
          start_at: new Date(now + startInMs),
          end_at: new Date(now + startInMs + 3_600_000),
          duration_sec: 1800,
          question_count: 1,
          total_marks: 1,
          is_premium: false,
          status: 'scheduled',
        },
      });
      examIds.push(e.id);
      return e;
    };
    const jobs = () =>
      new ExamJobsService(
        prisma,
        redis,
        app.get(PaperService),
        app.get(AttemptsService),
        new MeritService(prisma, redis),
        notifications,
      );

    it('pushes the 15 minute and the 1 minute reminder once, only to users who set one', async () => {
      const a = await newUser();
      const b = await newUser();
      const bystander = await newUser();
      const exam = await mkExam(10 * 60_000); // 10 minutes away: the 15 minute slot is due
      await prisma.exam_reminders.createMany({
        data: [
          { user_id: BigInt(a.user.id), exam_id: exam.id },
          { user_id: BigInt(b.user.id), exam_id: exam.id },
        ],
      });
      const j = jobs();
      expect(await j.sendReminders(new Date())).toBe(2);
      expect(await j.sendReminders(new Date())).toBe(0); // same slot: nothing again

      const first = await personal(a);
      expect(first).toHaveLength(1);
      expect(first[0]?.body).toContain('10 মিনিট');
      expect(await personal(bystander)).toHaveLength(0);

      // 50 seconds before the start the 1 minute slot is due.
      await prisma.exams.update({
        where: { id: exam.id },
        data: { start_at: new Date(Date.now() + 50_000), end_at: new Date(Date.now() + 3_650_000) },
      });
      expect(await j.sendReminders(new Date())).toBe(2);
      expect(await j.sendReminders(new Date())).toBe(0);
      expect(await personal(a)).toHaveLength(2);
    });

    it('does nothing for exams that are not close or have no reminders', async () => {
      const exam = await mkExam(3 * 3_600_000);
      await prisma.exam_reminders.deleteMany({ where: { exam_id: exam.id } });
      expect(await jobs().sendReminders(new Date())).toBe(0);
    });
  });
});
