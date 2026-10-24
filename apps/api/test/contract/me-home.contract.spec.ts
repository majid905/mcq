import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { SettingsService } from '../../src/settings/settings.service';
import { createTestApp, expectContract } from './harness';
import { bearer, device, PASSWORD, randomPhone, registerUser } from './helpers';

describe('contract + integration: me, settings, home, gate', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let settings: SettingsService;
  const phones: string[] = [];
  const examIds: bigint[] = [];

  const http = () => request(app.getHttpServer());
  const newUser = async (dev = device('web-1')) => {
    const phone = randomPhone();
    phones.push(phone);
    return registerUser(app, phone, { ...dev, device_id: `${dev.device_id}-${phone}` });
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    settings = app.get(SettingsService);
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
    await app.close();
  });

  // ------------------------------------------------------------------ /me
  describe('/me', () => {
    it('needs a token', async () => {
      const res = await http().get('/v1/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('GET returns the profile with free-tier quotas from app_settings', async () => {
      const s = await newUser();
      const res = await http().get('/v1/me').set(bearer(s.access_token));
      expect(res.status).toBe(200);
      expectContract(res);
      expect(res.body.data).toMatchObject({
        id: s.user.id,
        locale: 'bn',
        onboarding_done: false,
        subscription: { is_premium: false, trial_available: true },
        quotas: {
          practice_left_today: 50,
          live_exams_left_month: 4,
          search_answers_left_today: 10,
        },
      });
    });

    it('PATCH saves onboarding choices (FR-AUTH-08/09)', async () => {
      const s = await newUser();
      const res = await http()
        .patch('/v1/me')
        .set(bearer(s.access_token))
        .send({
          name: 'সাদিয়া ইসলাম',
          district_id: 1,
          target_node_ids: ['2', '1'],
          locale: 'en',
          theme: 'dark',
        });
      expect(res.status).toBe(200);
      expectContract(res);
      expect(res.body.data).toMatchObject({
        name: 'সাদিয়া ইসলাম',
        district_id: 1,
        target_node_ids: ['2', '1'],
        locale: 'en',
        theme: 'dark',
        onboarding_done: true,
      });
      await http().patch('/v1/me').set(bearer(s.access_token)).send({}).expect(200);
    });

    it('PATCH rejects unknown district, non-category targets and bad enums', async () => {
      const s = await newUser();
      const topic = await prisma.taxonomy_nodes.findFirstOrThrow({ where: { type: 'topic' } });
      const res = await http()
        .patch('/v1/me')
        .set(bearer(s.access_token))
        .send({ district_id: 65, target_node_ids: [String(topic.id)] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(
        (
          await http()
            .patch('/v1/me')
            .set(bearer(s.access_token))
            .send({ district_id: 40, target_node_ids: ['999999'] })
        ).body.error.details.fields,
      ).toHaveProperty('target_node_ids');
      expect(
        (await http().patch('/v1/me').set(bearer(s.access_token)).send({ theme: 'neon' })).status,
      ).toBe(400);
    });

    it('PUT /me/push-token binds the token to this device only', async () => {
      const s = await newUser(device('phone-a', 'android'));
      const res = await http()
        .put('/v1/me/push-token')
        .set(bearer(s.access_token))
        .send({ token: 'fcm-token-xyz' });
      expect(res.status).toBe(204);
      expectContract(res);
      const rows = await prisma.user_devices.findMany({ where: { push_token: 'fcm-token-xyz' } });
      expect(rows).toHaveLength(1);

      const other = await newUser(device('phone-b', 'android'));
      await http()
        .put('/v1/me/push-token')
        .set(bearer(other.access_token))
        .send({ token: 'fcm-token-xyz' })
        .expect(204);
      const moved = await prisma.user_devices.findMany({ where: { push_token: 'fcm-token-xyz' } });
      expect(moved).toHaveLength(1);
      expect(String(moved[0]?.user_id)).toBe(other.user.id);
    });

    it('POST /me/devices/reset signs out other devices, 2 per 30 days then 429 (FR-AUTH-07)', async () => {
      const s = await newUser(device('web-main', 'web'));
      const phone = s.user.phone;
      const phoneLogin = await http()
        .post('/v1/auth/login')
        .send({ phone, password: PASSWORD, device: device(`phone-${phone}`, 'android') })
        .expect(200);

      const first = await http().post('/v1/me/devices/reset').set(bearer(s.access_token));
      expect(first.status).toBe(204);
      expectContract(first);
      const out = await http()
        .post('/v1/auth/refresh')
        .send({ refresh_token: phoneLogin.body.data.refresh_token });
      expect(out.body.error.code).toBe('SESSION_REVOKED');
      // this device keeps working
      await http().get('/v1/me').set(bearer(s.access_token)).expect(200);

      await http().post('/v1/me/devices/reset').set(bearer(s.access_token)).expect(204);
      const third = await http().post('/v1/me/devices/reset').set(bearer(s.access_token));
      expect(third.status).toBe(429);
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
      expectContract(third);
    });

    it('DELETE /me closes the account and every session (FR-AUTH-10)', async () => {
      const s = await newUser();
      const res = await http().delete('/v1/me').set(bearer(s.access_token));
      expect(res.status).toBe(202);
      expectContract(res);

      expect((await http().get('/v1/me').set(bearer(s.access_token))).body.error.code).toBe(
        'SESSION_REVOKED',
      );
      expect(
        (await http().post('/v1/auth/refresh').send({ refresh_token: s.refresh_token })).body.error
          .code,
      ).toBe('SESSION_REVOKED');
      const login = await http()
        .post('/v1/auth/login')
        .send({ phone: s.user.phone, password: PASSWORD, device: device('again') });
      expect(login.status).toBe(401);
    });
  });

  // ------------------------------------------------------------------ /settings/public
  describe('/settings/public', () => {
    it('is public, cacheable and matches the contract', async () => {
      const res = await http().get('/v1/settings/public');
      expect(res.status).toBe(200);
      expectContract(res);
      expect(res.headers['cache-control']).toContain('max-age=30');
      expect(res.body.data).toMatchObject({
        maintenance: { enabled: false },
        min_supported_version: { android: '1.0.0', ios: '1.0.0' },
        free_live_exams_per_month: 4,
        free_practice_per_day: 50,
        trial_days: 7,
      });
    });
  });

  // ------------------------------------------------------------------ /home
  describe('/home', () => {
    // Category 5 (Admission) has no seeded exams, so these are the only ones its followers see.
    const mkExam = async (
      slug: string,
      status: 'running' | 'scheduled',
      startMin: number,
      endMin: number,
    ) => {
      const now = Date.now();
      const e = await prisma.exams.create({
        data: {
          type: 'live',
          category_id: 5,
          title_bn: `পরীক্ষা ${slug}`,
          title_en: `Exam ${slug}`,
          slug: `${slug}-${now}`,
          start_at: new Date(now + startMin * 60_000),
          end_at: new Date(now + endMin * 60_000),
          duration_sec: 1800,
          question_count: 30,
          total_marks: 30,
          status,
        },
      });
      examIds.push(e.id);
      return e;
    };

    it('filters by target exams, localizes and attaches my attempt + reminder (FR-HOME-01..03)', async () => {
      const running = await mkExam('running', 'running', -10, 60);
      const upcoming = await mkExam('upcoming', 'scheduled', 180, 300);
      const s = await newUser();
      await http()
        .patch('/v1/me')
        .set(bearer(s.access_token))
        .send({ target_node_ids: ['5'], locale: 'en', district_id: 1 })
        .expect(200);
      await prisma.exam_reminders.create({
        data: { user_id: BigInt(s.user.id), exam_id: upcoming.id },
      });
      const attempt = await prisma.attempts.create({
        data: {
          user_id: BigInt(s.user.id),
          exam_id: running.id,
          kind: 'live',
          started_at: new Date(),
          total_questions: 30,
        },
      });

      const res = await http().get('/v1/home').set(bearer(s.access_token));
      expect(res.status).toBe(200);
      expectContract(res);
      const home = res.body.data;

      expect(home.running_exams.map((e: { id: string }) => e.id)).toEqual([String(running.id)]);
      expect(home.running_exams[0]).toMatchObject({
        title: 'Exam running',
        category: 'Admission',
        status: 'running',
        my_attempt: { attempt_id: String(attempt.id), status: 'in_progress', score: null },
        has_reminder: false,
      });
      expect(home.next_exam).toMatchObject({
        id: String(upcoming.id),
        status: 'upcoming',
        has_reminder: true,
        my_attempt: null,
      });
      expect(home.today).toEqual({ answered: 0, accuracy_pct: 0, streak: 0, goal: 10 });
      expect(home.continue_practice).toBeNull();
      expect(home.banners.length).toBeGreaterThanOrEqual(2);
    });

    it('a user with no targets sees every category, and the card turns open_soon 10 min before start', async () => {
      const soon = await mkExam('soon', 'scheduled', 5, 125);
      const s = await newUser();
      const res = await http().get('/v1/home').set(bearer(s.access_token));
      expectContract(res);
      // Seeded categories also have exams; ours starts earliest of the upcoming ones.
      expect(res.body.data.next_exam).toMatchObject({ id: String(soon.id), status: 'open_soon' });
    });

    it('shows continue_practice for an in-progress quick practice', async () => {
      const s = await newUser();
      await prisma.attempts.create({
        data: {
          user_id: BigInt(s.user.id),
          kind: 'quick_practice',
          started_at: new Date(),
          total_questions: 20,
          answers: { '1': 'a', '2': 'c', '3': 'b' },
        },
      });
      const res = await http().get('/v1/home').set(bearer(s.access_token));
      expectContract(res);
      expect(res.body.data.continue_practice).toMatchObject({
        answered: 3,
        total: 20,
        title: 'অনুশীলন চালিয়ে যান',
      });
    });
  });

  // ------------------------------------------------------------------ maintenance + version gate
  describe('gate', () => {
    const snapshot = async () => {
      const rows = await prisma.app_settings.findMany({
        where: { key: { in: ['maintenance', 'min_supported_version'] } },
      });
      return rows;
    };
    const setSetting = async (key: string, value: object) => {
      await prisma.app_settings.update({ where: { key }, data: { value } });
      await settings.invalidate();
    };
    let original: Awaited<ReturnType<typeof snapshot>>;

    beforeAll(async () => {
      original = await snapshot();
    });
    afterEach(async () => {
      for (const row of original) {
        await prisma.app_settings.update({
          where: { key: row.key },
          data: { value: row.value as object },
        });
      }
      await settings.invalidate();
    });

    it('maintenance mode answers 503 with the admin message, but health and public settings stay up', async () => {
      const s = await newUser();
      await setSetting('maintenance', {
        enabled: true,
        message_bn: 'আজ রাত ২টা পর্যন্ত রক্ষণাবেক্ষণ',
        message_en: 'Back at 2 AM',
      });

      const blocked = await http().get('/v1/me').set(bearer(s.access_token));
      expect(blocked.status).toBe(503);
      expect(blocked.body.error).toEqual({
        code: 'MAINTENANCE',
        message: 'আজ রাত ২টা পর্যন্ত রক্ষণাবেক্ষণ',
      });
      const en = await http()
        .get('/v1/me')
        .set(bearer(s.access_token))
        .set('Accept-Language', 'en');
      expect(en.body.error.message).toBe('Back at 2 AM');
      expect(
        (
          await http()
            .post('/v1/auth/login')
            .send({ phone: s.user.phone, password: PASSWORD, device: device('m') })
        ).status,
      ).toBe(503);

      expect((await http().get('/v1/health')).status).toBe(200);
      const pub = await http().get('/v1/settings/public');
      expect(pub.status).toBe(200);
      expect(pub.body.data.maintenance.enabled).toBe(true);
    });

    it('426 UPGRADE_REQUIRED for old mobile builds only', async () => {
      const s = await newUser();
      await setSetting('min_supported_version', { android: '2.0.0', ios: '1.0.0' });
      const get = (platform: string | null, version: string | null) => {
        let r = http().get('/v1/me').set(bearer(s.access_token));
        if (platform) r = r.set('X-Platform', platform);
        if (version) r = r.set('X-App-Version', version);
        return r;
      };

      const old = await get('android', '1.9.9');
      expect(old.status).toBe(426);
      expect(old.body.error).toMatchObject({
        code: 'UPGRADE_REQUIRED',
        details: { min_version: '2.0.0', platform: 'android' },
      });
      expect((await get('android', '2.0.0')).status).toBe(200);
      expect((await get('android', '10.0.0')).status).toBe(200); // numeric, not lexical, compare
      expect((await get('ios', '1.0.0')).status).toBe(200);
      expect((await get('web', '0.0.1')).status).toBe(200);
      expect((await get(null, null)).status).toBe(200);
    });
  });
});
