import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';

const OTP = '123456'; // dev OTP: console SMS driver
const PASSWORD = 'Secret#123';

describe('contract + integration: auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let limits: RateLimitService;
  const phones: string[] = [];

  const http = () => request(app.getHttpServer());
  const randomPhone = () => {
    const p = `0171${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    phones.push(p);
    return p;
  };
  const device = (id: string, platform: 'android' | 'ios' | 'web' = 'web') => ({
    device_id: id,
    platform,
    model: 'jest',
    app_version: '1.0.0',
  });

  async function register(phone: string, dev = device(`dev-${phone}`)) {
    expectContract(
      await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' }).expect(200),
    );
    const verify = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: OTP, purpose: 'register' })
      .expect(200);
    expectContract(verify);
    const res = await http()
      .post('/v1/auth/register')
      .send({
        verification_token: verify.body.data.verification_token,
        name: 'রাকিব হাসান',
        password: PASSWORD,
        device: dev,
      })
      .expect(201);
    expectContract(res);
    return res.body.data as { access_token: string; refresh_token: string; user: { id: string } };
  }

  const login = (phone: string, dev = device(`dev-${phone}`), password = PASSWORD) =>
    http().post('/v1/auth/login').send({ phone, password, device: dev });
  const refresh = (token: string) => http().post('/v1/auth/refresh').send({ refresh_token: token });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    limits = app.get(RateLimitService);
  });

  beforeEach(async () => {
    await limits.reset('');
    const keys = await redis.client.keys('otp:*');
    if (keys.length > 0) await redis.client.del(...keys);
  });

  afterAll(async () => {
    await prisma.users.deleteMany({ where: { phone: { in: phones } } });
    await app.close();
  });

  it('registers with OTP and returns a full session matching the contract', async () => {
    const phone = randomPhone();
    const session = await register(phone);
    expect(session.access_token.split('.')).toHaveLength(3);
    expect(session.refresh_token.length).toBeGreaterThan(30);
    const payload = JSON.parse(
      Buffer.from(session.access_token.split('.')[1] as string, 'base64url').toString(),
    );
    expect(payload).toMatchObject({ sub: session.user.id, prem: false });
    expect(payload.exp - payload.iat).toBe(900);

    const row = await prisma.users.findUnique({ where: { phone } });
    expect(row?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('wrong OTP is 400 OTP_INVALID; registered phone is 409 PHONE_EXISTS', async () => {
    const phone = randomPhone();
    await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' }).expect(200);
    const bad = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: '000000', purpose: 'register' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('OTP_INVALID');
    expectContract(bad);

    await register(randomPhone()); // unrelated user must not interfere
    const known = randomPhone();
    await register(known);
    const dup = await http()
      .post('/v1/auth/otp/request')
      .send({ phone: known, purpose: 'register' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PHONE_EXISTS');
    expectContract(dup);
  });

  it('rejects an invalid body with 400 VALIDATION_FAILED and per-field details', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .send({ phone: '123', password: '', device: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['phone', 'password', 'device.device_id']),
    );
  });

  it('OTP request limit: 4th request per phone in an hour is 429 with Retry-After', async () => {
    const phone = randomPhone();
    for (let i = 0; i < 3; i++) {
      await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' }).expect(200);
      await redis.client.del(`otp:register:${phone}`); // skip the 60 s cooldown for the test
    }
    const res = await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expectContract(res);
  });

  it('resend inside 60 s is 429', async () => {
    const phone = randomPhone();
    await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' }).expect(200);
    const again = await http().post('/v1/auth/otp/request').send({ phone, purpose: 'register' });
    expect(again.status).toBe(429);
    expect(Number(again.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('login: success matches the contract, wrong password is 401, unknown phone looks the same', async () => {
    const phone = randomPhone();
    await register(phone);
    const ok = await login(phone);
    expect(ok.status).toBe(200);
    expectContract(ok);

    const wrong = await login(phone, device(`dev-${phone}`), 'Wrong#Pass1');
    const unknown = await login(randomPhone(), device('x'), PASSWORD);
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expectContract(res);
    }
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account for 15 min after 5 wrong passwords (FR-AUTH-03)', async () => {
    const phone = randomPhone();
    await register(phone);
    for (let i = 0; i < 5; i++) {
      await login(phone, device(`dev-${phone}`), 'Wrong#Pass1').expect(401);
    }
    const locked = await login(phone); // even the right password is refused now
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const until = new Date(locked.body.error.details.until).getTime();
    expect(until - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    expectContract(locked);

    await prisma.users.update({
      where: { phone },
      data: { locked_until: new Date(Date.now() - 1000) },
    });
    await login(phone).expect(200);
  });

  it('refresh rotates the token; reusing the old one revokes the whole family (FR-AUTH-06)', async () => {
    const phone = randomPhone();
    const first = await register(phone);

    const second = await refresh(first.refresh_token);
    expect(second.status).toBe(200);
    expectContract(second);
    expect(second.body.data.refresh_token).not.toBe(first.refresh_token);

    const reuse = await refresh(first.refresh_token);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('SESSION_REVOKED');
    expectContract(reuse);

    // the newest token of the same family is dead too
    const afterTheft = await refresh(second.body.data.refresh_token);
    expect(afterTheft.status).toBe(401);
    expect(afterTheft.body.error.code).toBe('SESSION_REVOKED');
  });

  it('two parallel refreshes with one token: exactly one wins', async () => {
    const { refresh_token } = await register(randomPhone());
    const [a, b] = await Promise.all([refresh(refresh_token), refresh(refresh_token)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('garbage refresh token is 401 UNAUTHENTICATED', async () => {
    const res = await refresh('not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('device binding: a new browser signs out the old one; mobile and web coexist (FR-AUTH-07)', async () => {
    const phone = randomPhone();
    const webA = await register(phone, device('web-A', 'web'));
    const mobile = await login(phone, device('phone-1', 'android')).expect(200);

    const webB = await login(phone, device('web-B', 'web')).expect(200);
    // web-A is out: its refresh token and its still-unexpired access token both stop working
    const old = await refresh(webA.refresh_token);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('SESSION_REVOKED');
    const oldAccess = await http().post('/v1/auth/logout').set(bearer(webA.access_token));
    expect(oldAccess.status).toBe(401);
    expect(oldAccess.body.error.code).toBe('SESSION_REVOKED');

    // web-B and the phone are fine
    await refresh(webB.body.data.refresh_token).expect(200);
    await refresh(mobile.body.data.refresh_token).expect(200);

    const active = await prisma.user_devices.findMany({
      where: { user_id: BigInt(webA.user.id), is_active: true },
    });
    expect(active.map((d) => d.device_id).sort()).toEqual(['phone-1', 'web-B']);
  });

  it('logout signs out this device; protected routes need a token', async () => {
    const phone = randomPhone();
    const s = await register(phone);

    const anon = await http().post('/v1/auth/logout');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    expect((await http().post('/v1/auth/logout').set(bearer('junk'))).status).toBe(401);

    const out = await http().post('/v1/auth/logout').set(bearer(s.access_token));
    expect(out.status).toBe(204);
    expectContract(out);

    const after = await refresh(s.refresh_token);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('SESSION_REVOKED');
  });

  it('password reset sets a new password and revokes every session (FR-AUTH-05)', async () => {
    const phone = randomPhone();
    const s = await register(phone);

    await http()
      .post('/v1/auth/otp/request')
      .send({ phone, purpose: 'reset_password' })
      .expect(200);
    const verify = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: OTP, purpose: 'reset_password' })
      .expect(200);
    const done = await http()
      .post('/v1/auth/password/reset')
      .send({ verification_token: verify.body.data.verification_token, password: 'NewSecret#456' });
    expect(done.status).toBe(204);
    expectContract(done);

    expect((await refresh(s.refresh_token)).body.error.code).toBe('SESSION_REVOKED');
    expect((await http().post('/v1/auth/logout').set(bearer(s.access_token))).body.error.code).toBe(
      'SESSION_REVOKED',
    );
    await login(phone).expect(401);
    await login(phone, device(`dev-${phone}`), 'NewSecret#456').expect(200);
  });

  it('a register verification token cannot reset a password', async () => {
    const victim = randomPhone();
    await register(victim);
    const mine = randomPhone();
    await http()
      .post('/v1/auth/otp/request')
      .send({ phone: mine, purpose: 'register' })
      .expect(200);
    const v = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone: mine, code: OTP, purpose: 'register' })
      .expect(200);
    const res = await http()
      .post('/v1/auth/password/reset')
      .send({ verification_token: v.body.data.verification_token, password: 'Hacked#1234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('reset_password for an unknown number answers like a known one (no enumeration)', async () => {
    const known = randomPhone();
    await register(known);
    const a = await http()
      .post('/v1/auth/otp/request')
      .send({ phone: known, purpose: 'reset_password' });
    const b = await http()
      .post('/v1/auth/otp/request')
      .send({ phone: randomPhone(), purpose: 'reset_password' });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });
});
