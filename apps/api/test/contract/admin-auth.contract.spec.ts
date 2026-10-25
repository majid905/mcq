import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminAuthService } from '../../src/admin/admin-auth.service';
import { AuditService } from '../../src/admin/audit.service';
import { totpCode, totpStep } from '../../src/admin/totp';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser } from './helpers';

const PASS = 'Admin#Pass-12345';

describe('contract + integration: admin auth, RBAC, audit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let limits: RateLimitService;
  const emails: string[] = [];
  const adminIds: number[] = [];
  const http = () => request(app.getHttpServer());

  const makeAdmin = async (role: string): Promise<{ id: number; email: string }> => {
    const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: role } });
    const email = `t${Date.now()}${Math.floor(Math.random() * 1e6)}@admin.test`;
    emails.push(email);
    const row = await prisma.admins.create({
      data: {
        email,
        name: `Test ${role}`,
        password_hash: await app.get(PasswordService).hash(PASS),
        role_id: roleRow.id,
      },
    });
    adminIds.push(row.id);
    return { id: row.id, email };
  };
  const login = (email: string, password = PASS, totp?: string) =>
    http()
      .post('/v1/admin/auth/login')
      .send({ email, password, ...(totp ? { totp } : {}) });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    limits = app.get(RateLimitService);
  });

  afterAll(async () => {
    await prisma.audit_logs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.admins.deleteMany({ where: { id: { in: adminIds } } });
    const keys = [
      ...adminIds.flatMap((id) => [
        `admin:ctx:${id}`,
        `admin:totp:pending:${id}`,
        `admin:totp:last:${id}`,
        `rl:admin:${id}`,
      ]),
      ...emails.map((e) => `rl:adminlogin:email:${e}`),
    ];
    if (keys.length > 0) await redis.client.del(...keys);
    await limits.reset('adminlogin:ip:');
    await app.close();
  });

  it('logs in, returns role and permissions, and /admin/me matches the contract', async () => {
    const a = await makeAdmin('super_admin');
    const res = await login(a.email);
    expect(res.status).toBe(200);
    expectContract(res);
    expect(res.body.data.admin).toMatchObject({
      email: a.email,
      role: 'super_admin',
      permissions: ['*'],
      totp_enabled: false,
    });

    const me = await http().get('/v1/admin/me').set(bearer(res.body.data.access_token));
    expect(me.status).toBe(200);
    expectContract(me);
    expect(me.body.data.id).toBe(String(a.id));
  });

  it('refuses wrong passwords and unknown emails the same way', async () => {
    const a = await makeAdmin('super_admin');
    const wrong = await login(a.email, 'nope-nope-nope');
    const unknown = await login('nobody@admin.test', PASS);
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expectContract(res);
    }
  });

  it('locks an email after too many attempts (423 with until)', async () => {
    const a = await makeAdmin('super_admin');
    for (let i = 0; i < 8; i++) await login(a.email, 'wrong-password-x');
    const res = await login(a.email, PASS);
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(res.body.error.details.until).toEqual(expect.any(String));
    await redis.client.del(`rl:adminlogin:email:${a.email}`);
  });

  it('rejects student tokens on admin routes and admin tokens on student routes', async () => {
    const a = await makeAdmin('super_admin');
    const adminToken = (await login(a.email)).body.data.access_token as string;
    const student = await registerUser(app, randomPhone());

    const asStudent = await http().get('/v1/admin/me').set(bearer(student.access_token));
    expect(asStudent.status).toBe(401);
    const asAdmin = await http().get('/v1/me').set(bearer(adminToken));
    expect(asAdmin.status).toBe(401);
    expect((await http().get('/v1/admin/me')).status).toBe(401);
  });

  it('enforces permissions: support can read users but not the audit log', async () => {
    const a = await makeAdmin('support');
    const token = (await login(a.email)).body.data.access_token as string;
    const res = await http().get('/v1/admin/audit-logs').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.details.required).toEqual(['audit.read']);
    expectContract(res);
  });

  it('a deactivated admin loses access within the cache window', async () => {
    const a = await makeAdmin('super_admin');
    const token = (await login(a.email)).body.data.access_token as string;
    expect((await http().get('/v1/admin/me').set(bearer(token))).status).toBe(200);
    await prisma.admins.update({ where: { id: a.id }, data: { is_active: false } });
    await app.get(AdminAuthService).forget(a.id.toString());
    expect((await http().get('/v1/admin/me').set(bearer(token))).status).toBe(401);
    expect((await login(a.email)).status).toBe(401);
  });

  it('rotates refresh tokens (each works once) and logout revokes', async () => {
    const a = await makeAdmin('super_admin');
    const first = (await login(a.email)).body.data.refresh_token as string;
    const rotated = await http().post('/v1/admin/auth/refresh').send({ refresh_token: first });
    expect(rotated.status).toBe(200);
    expectContract(rotated);
    expect(rotated.body.data.refresh_token).not.toBe(first);

    const replay = await http().post('/v1/admin/auth/refresh').send({ refresh_token: first });
    expect(replay.status).toBe(401);

    const token = rotated.body.data.access_token as string;
    const out = await http()
      .post('/v1/admin/auth/logout')
      .set(bearer(token))
      .send({ refresh_token: rotated.body.data.refresh_token });
    expect(out.status).toBe(204);
    const after = await http()
      .post('/v1/admin/auth/refresh')
      .send({ refresh_token: rotated.body.data.refresh_token });
    expect(after.status).toBe(401);
  });

  it('TOTP: enrol, then login needs a fresh code and refuses a replayed one', async () => {
    const a = await makeAdmin('super_admin');
    const token = (await login(a.email)).body.data.access_token as string;

    const setup = await http().post('/v1/admin/auth/totp/setup').set(bearer(token));
    expect(setup.status).toBe(200);
    expectContract(setup);
    const secret = setup.body.data.secret as string;
    expect(setup.body.data.otpauth_url).toContain(`secret=${secret}`);

    const bad = await http()
      .post('/v1/admin/auth/totp/enable')
      .set(bearer(token))
      .send({ code: '000000' });
    expect(bad.status).toBe(400);
    const step = totpStep(Date.now());
    const enable = await http()
      .post('/v1/admin/auth/totp/enable')
      .set(bearer(token))
      .send({ code: totpCode(secret, step) });
    expect(enable.status).toBe(204);

    const stored = await prisma.admins.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.totp_secret).not.toBeNull();
    expect(stored.totp_secret).not.toContain(secret);

    const missing = await login(a.email);
    expect(missing.status).toBe(401);
    expect(missing.body.error.details.totp_required).toBe(true);
    expectContract(missing);

    const okRes = await login(a.email, PASS, totpCode(secret, step));
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.admin.totp_enabled).toBe(true);

    const replay = await login(a.email, PASS, totpCode(secret, step));
    expect(replay.status).toBe(401);
  });

  it('lists audit entries newest first with admin names (cursor paginated)', async () => {
    const a = await makeAdmin('super_admin');
    const audit = app.get(AuditService);
    const actor = {
      admin: {
        id: BigInt(a.id),
        email: a.email,
        name: 'x',
        role: 'super_admin',
        permissions: ['*'],
        totpEnabled: false,
      },
      ip: '10.0.0.1',
    };
    for (let i = 1; i <= 3; i++) {
      await audit.record(actor, {
        action: 'test.update',
        entityType: 'test',
        entityId: 7,
        before: { n: i - 1 },
        after: { n: i, big: 12345678901234567890n },
      });
    }
    const token = (await login(a.email)).body.data.access_token as string;
    const p1 = await http().get(`/v1/admin/audit-logs?admin_id=${a.id}&limit=2`).set(bearer(token));
    expect(p1.status).toBe(200);
    expectContract(p1);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.data[0].after.n).toBe(3);
    expect(p1.body.data[0].admin_name).toBe(`Test super_admin`);
    expect(p1.body.data[0].after.big).toBe('12345678901234567890');
    expect(p1.body.meta.has_more).toBe(true);

    const p2 = await http()
      .get(`/v1/admin/audit-logs?admin_id=${a.id}&limit=2&cursor=${p1.body.meta.next_cursor}`)
      .set(bearer(token));
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.data[0].after.n).toBe(1);
    expect(p2.body.meta.has_more).toBe(false);
  });
});
