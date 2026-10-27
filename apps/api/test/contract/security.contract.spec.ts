import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { totpCode, totpStep } from '../../src/admin/totp';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { AccountJobsService } from '../../src/me/account-jobs.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp } from './harness';
import { bearer, device, PASSWORD, randomPhone, registerUser } from './helpers';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('security: headers, limits, tokens, admin allowlist, account anonymisation', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  const phones: string[] = [];
  const adminIds: number[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await app.get(RateLimitService).reset('');
  });

  afterAll(async () => {
    await app.get(RateLimitService).reset('');
    const users = await prisma.users.findMany({
      where: { OR: [{ phone: { in: phones } }, { name: 'Deleted user' }] },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.bookmarks.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user_devices.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
    await prisma.admins.deleteMany({ where: { id: { in: adminIds } } });
    await app.close();
  });

  describe('response headers', () => {
    it('sends the baseline security headers and hides the framework', async () => {
      for (const path of ['/v1/health', '/v1/packages']) {
        const res = await http().get(path);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['content-security-policy']).toContain("default-src 'none'");
        expect(res.headers['referrer-policy']).toBe('no-referrer');
        expect(res.headers['x-powered-by']).toBeUndefined();
      }
      const https = await http().get('/v1/health').set('X-Forwarded-Proto', 'https');
      expect(https.headers['strict-transport-security']).toContain('max-age=');
    });
  });

  describe('rate limits', () => {
    it('limits anonymous traffic per address but never the health probe or admin login', async () => {
      const limits = app.get(RateLimitService);
      await limits.reset('public:');
      let blocked = 0;
      let retryAfter: string | undefined;
      for (let i = 0; i < 620; i++) {
        const res = await http().get('/v1/packages');
        if (res.status === 429) {
          blocked++;
          retryAfter = res.headers['retry-after'];
          expect(res.body.error.code).toBe('RATE_LIMITED');
        }
      }
      expect(blocked).toBeGreaterThanOrEqual(15);
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect((await http().get('/v1/health')).status).toBe(200);
      const login = await http()
        .post('/v1/admin/auth/login')
        .send({ email: 'nobody@admin.test', password: 'whatever-whatever' });
      expect(login.status).toBe(401); // not 429: admin routes have their own limits
      await limits.reset('public:');
    });

    it('locks a student account after repeated wrong passwords, even for the right one', async () => {
      const phone = randomPhone();
      phones.push(phone);
      await registerUser(app, phone);
      await app.get(RateLimitService).reset('login:');
      const login = (password: string) =>
        http()
          .post('/v1/auth/login')
          .send({ phone, password, device: device('sec-dev') });
      for (let i = 0; i < 5; i++) expect((await login('Wrong#Pass-1')).status).toBe(401);
      const locked = await login('Wrong#Pass-1');
      expect(locked.status).toBe(423);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      expect((await login(PASSWORD)).status).toBe(423);
    });
  });

  describe('tokens', () => {
    it('rejects unsigned, wrongly signed and tampered access tokens', async () => {
      const claims = { sub: '1', dev: '1', prem: true, exp: Math.floor(Date.now() / 1000) + 600 };
      const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(claims)}.`;
      const head = b64({ alg: 'HS256', typ: 'JWT' });
      const sig = createHmac('sha256', 'not-the-secret')
        .update(`${head}.${b64(claims)}`)
        .digest('base64url');
      const wrongKey = `${head}.${b64(claims)}.${sig}`;

      const user = await registerUser(app, randomPhone());
      phones.push(user.user.phone);
      const [h, , s] = user.access_token.split('.');
      const tampered = `${h}.${b64({ ...claims, sub: '1' })}.${s}`;

      for (const token of [unsigned, wrongKey, tampered, 'garbage', '']) {
        const res = await http().get('/v1/me').set(bearer(token));
        expect(res.status).toBe(401);
      }
      expect((await http().get('/v1/me').set(bearer(user.access_token))).status).toBe(200);
    });

    it('does not accept a refresh token as an access token', async () => {
      const user = await registerUser(app, randomPhone());
      phones.push(user.user.phone);
      expect((await http().get('/v1/me').set(bearer(user.refresh_token))).status).toBe(401);
    });
  });

  describe('admin IP allowlist', () => {
    const login = (a: INestApplication, email: string) =>
      request(a.getHttpServer())
        .post('/v1/admin/auth/login')
        .send({ email, password: 'Admin#Pass-12345' });

    it('closes the whole admin API to other networks, login included', async () => {
      const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: 'super_admin' } });
      const email = `sec${Date.now().toString(36)}@admin.test`;
      const row = await prisma.admins.create({
        data: {
          email,
          name: 'Sec',
          password_hash: await app.get(PasswordService).hash('Admin#Pass-12345'),
          role_id: roleRow.id,
        },
      });
      adminIds.push(row.id);

      process.env['ADMIN_IP_ALLOWLIST'] = '203.0.113.9';
      const closed = await createTestApp();
      try {
        expect((await login(closed, email)).status).toBe(403);
        expect((await request(closed.getHttpServer()).get('/v1/admin/me')).status).toBe(403);
      } finally {
        await closed.close();
      }

      process.env['ADMIN_IP_ALLOWLIST'] = '127.0.0.1,10.0.0.0/8';
      const open = await createTestApp();
      try {
        expect((await login(open, email)).status).toBe(200);
      } finally {
        await open.close();
        delete process.env['ADMIN_IP_ALLOWLIST'];
      }
    });
  });

  describe('mandatory admin TOTP', () => {
    it('lets a session without TOTP do nothing but set it up', async () => {
      const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: 'super_admin' } });
      const email = `totp${Date.now().toString(36)}@admin.test`;
      const row = await prisma.admins.create({
        data: {
          email,
          name: 'Totp',
          password_hash: await app.get(PasswordService).hash('Admin#Pass-12345'),
          role_id: roleRow.id,
        },
      });
      adminIds.push(row.id);

      process.env['ADMIN_REQUIRE_TOTP'] = 'true';
      const strict = await createTestApp();
      try {
        const api = () => request(strict.getHttpServer());
        const login = await api()
          .post('/v1/admin/auth/login')
          .send({ email, password: 'Admin#Pass-12345' });
        expect(login.status).toBe(200);
        const token = login.body.data.access_token as string;

        const blocked = await api().get('/v1/admin/dashboard').set(bearer(token));
        expect(blocked.status).toBe(403);
        expect(blocked.body.error.details.reason).toBe('totp_setup_required');
        expect((await api().get('/v1/admin/me').set(bearer(token))).status).toBe(200);

        const setup = await api().post('/v1/admin/auth/totp/setup').set(bearer(token));
        expect(setup.status).toBe(200);
        const enable = await api()
          .post('/v1/admin/auth/totp/enable')
          .set(bearer(token))
          .send({ code: totpCode(setup.body.data.secret, totpStep(Date.now())) });
        expect(enable.status).toBe(204);
        expect((await api().get('/v1/admin/dashboard').set(bearer(token))).status).toBe(200);
      } finally {
        await strict.close();
        delete process.env['ADMIN_REQUIRE_TOTP'];
      }
    });
  });

  describe('account deletion (FR-AUTH-10)', () => {
    it('anonymises accounts closed more than 30 days ago and frees the phone', async () => {
      const jobs = new AccountJobsService(prisma, app.get(RedisService));
      const old = randomPhone();
      const recent = randomPhone();
      phones.push(old, recent);
      const oldUser = await registerUser(app, old);
      const recentUser = await registerUser(app, recent);
      await prisma.bookmarks.create({
        data: {
          user_id: BigInt(oldUser.user.id),
          question_id: (await prisma.questions.findFirstOrThrow()).id,
        },
      });

      for (const u of [oldUser, recentUser]) {
        expect((await http().delete('/v1/me').set(bearer(u.access_token))).status).toBe(202);
      }
      const day = 86_400_000;
      await prisma.users.update({
        where: { id: BigInt(oldUser.user.id) },
        data: { deleted_at: new Date(Date.now() - 31 * day) },
      });
      await prisma.users.update({
        where: { id: BigInt(recentUser.user.id) },
        data: { deleted_at: new Date(Date.now() - 29 * day) },
      });

      expect(await jobs.anonymizeDue(new Date())).toBeGreaterThanOrEqual(1);
      const gone = await prisma.users.findUniqueOrThrow({ where: { id: BigInt(oldUser.user.id) } });
      expect(gone).toMatchObject({
        phone: `del-${oldUser.user.id}`,
        name: 'Deleted user',
        password_hash: null,
        avatar_url: null,
        status: 'deleted',
      });
      expect(await prisma.user_devices.count({ where: { user_id: gone.id } })).toBe(0);
      expect(await prisma.bookmarks.count({ where: { user_id: gone.id } })).toBe(0);

      const kept = await prisma.users.findUniqueOrThrow({
        where: { id: BigInt(recentUser.user.id) },
      });
      expect(kept.phone).toBe(recent);

      // idempotent, and the number can be registered again
      expect(await jobs.anonymizeDue(new Date())).toBe(0);
      const again = await registerUser(app, old);
      expect(again.user.id).not.toBe(oldUser.user.id);
    });
  });
});
