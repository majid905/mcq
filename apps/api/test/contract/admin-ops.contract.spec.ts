import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PasswordService } from '../../src/auth/password.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser } from './helpers';

const PASS = 'Admin#Pass-12345';

describe('contract + integration: admin catalog, accounts, users, payments, settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const stamp = Date.now().toString(36).toUpperCase();
  const adminIds: number[] = [];
  const packageIds: number[] = [];
  const couponIds: number[] = [];
  const bannerIds: number[] = [];
  const roleIds: number[] = [];
  const phones: string[] = [];
  let superToken: string;
  let supportToken: string;
  let superId: number;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  const makeAdmin = async (role: string) => {
    const roleRow = await prisma.roles.findUniqueOrThrow({ where: { name: role } });
    const row = await prisma.admins.create({
      data: {
        email: `ops${stamp}${adminIds.length}@admin.test`,
        name: `Ops ${role}`,
        password_hash: await app.get(PasswordService).hash(PASS),
        role_id: roleRow.id,
      },
    });
    adminIds.push(row.id);
    const login = await http()
      .post('/v1/admin/auth/login')
      .send({ email: row.email, password: PASS });
    return { id: row.id, email: row.email, token: login.body.data.access_token as string };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await app.get(RateLimitService).reset('');
    const s = await makeAdmin('super_admin');
    superToken = s.token;
    superId = s.id;
    supportToken = (await makeAdmin('support')).token;
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    const uids = users.map((u) => u.id);
    await prisma.subscriptions.deleteMany({ where: { user_id: { in: uids } } });
    await prisma.audit_logs.deleteMany({ where: { admin_id: { in: adminIds } } });
    await prisma.admins.deleteMany({
      where: {
        OR: [
          { id: { in: adminIds } },
          { email: { endsWith: `${stamp.toLowerCase()}@admin.test` } },
        ],
      },
    });
    await prisma.admins.deleteMany({ where: { email: { startsWith: `created${stamp}` } } });
    await prisma.roles.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.coupons.deleteMany({ where: { id: { in: couponIds } } });
    await prisma.banners.deleteMany({ where: { id: { in: bannerIds } } });
    await prisma.packages.deleteMany({ where: { id: { in: packageIds } } });
    await redis.client.del(...adminIds.map((i) => `admin:ctx:${i}`), 'noop');
    await app.close();
  });

  describe('dashboard and audit', () => {
    it('serves KPIs to any admin', async () => {
      const res = await http().get('/v1/admin/dashboard').set(as(supportToken));
      expect(res.status).toBe(200);
      expectContract(res);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          signups_today: expect.any(Number),
          mau: expect.any(Number),
          queues: expect.objectContaining({ submit: expect.any(Number) }),
        }),
      );
    });
  });

  describe('packages', () => {
    it('creates, lists, updates and audits; deleting a sold package is refused', async () => {
      const body = {
        name_bn: `T${stamp} প্যাকেজ`,
        name_en: `T${stamp} Package`,
        duration_days: 30,
        price_bdt: 250,
        features: ['a', 'b'],
        category_ids: null,
      };
      const created = await http().post('/v1/admin/packages').set(as(superToken)).send(body);
      expect(created.status).toBe(201);
      expectContract(created);
      const id = created.body.data.id as string;
      packageIds.push(Number(id));

      const list = await http().get('/v1/admin/packages?limit=100').set(as(superToken));
      expectContract(list);
      expect((list.body.data as { id: string }[]).some((p) => p.id === id)).toBe(true);

      const upd = await http()
        .put(`/v1/admin/packages/${id}`)
        .set(as(superToken))
        .send({ ...body, price_bdt: 300, is_active: false });
      expect(upd.status).toBe(200);
      expectContract(upd);
      expect(upd.body.data).toMatchObject({ price_bdt: 300, is_active: false });

      const logs = await http()
        .get(`/v1/admin/audit-logs?entity_type=package&entity_id=${id}`)
        .set(as(superToken));
      expect((logs.body.data as { action: string }[]).map((l) => l.action).sort()).toEqual([
        'package.create',
        'package.update',
      ]);
      expect(logs.body.data[0].before.price_bdt).toBe(250);

      const user = await registerUser(app, randomPhone());
      phones.push(user.user.phone);
      await prisma.subscriptions.create({
        data: {
          user_id: BigInt(user.user.id),
          package_id: Number(id),
          source: 'manual',
          starts_at: new Date(),
          ends_at: new Date(Date.now() + 86_400_000),
        },
      });
      const del = await http().delete(`/v1/admin/packages/${id}`).set(as(superToken));
      expect(del.status).toBe(409);
      expect(del.body.error.code).toBe('IN_USE');
      expectContract(del);
      await prisma.subscriptions.deleteMany({ where: { user_id: BigInt(user.user.id) } });

      const gone = await http().delete(`/v1/admin/packages/${id}`).set(as(superToken));
      expect(gone.status).toBe(204);
      packageIds.pop();
      expect((await http().delete(`/v1/admin/packages/${id}`).set(as(superToken))).status).toBe(
        404,
      );
    });

    it('validates input and enforces permissions', async () => {
      const bad = await http()
        .post('/v1/admin/packages')
        .set(as(superToken))
        .send({ name_bn: 'x', name_en: 'x', duration_days: 0, price_bdt: -1 });
      expect(bad.status).toBe(400);
      expectContract(bad);

      const denied = await http()
        .post('/v1/admin/packages')
        .set(as(supportToken))
        .send({ name_bn: 'x', name_en: 'x', duration_days: 30, price_bdt: 1 });
      expect(denied.status).toBe(403);

      const accountant = await makeAdmin('accountant');
      const ok = await http().get('/v1/admin/packages').set(as(accountant.token));
      expect(ok.status).toBe(200); // writers may read
      expect((await http().get('/v1/admin/admins').set(as(accountant.token))).status).toBe(403);
    });
  });

  describe('coupons and banners', () => {
    it('stores codes upper-case, rejects duplicates and bad percentages', async () => {
      const body = { code: `t${stamp}x`, type: 'percent', value: 15, per_user_limit: 2 };
      const res = await http().post('/v1/admin/coupons').set(as(superToken)).send(body);
      expect(res.status).toBe(201);
      expectContract(res);
      expect(res.body.data.code).toBe(`T${stamp}X`);
      couponIds.push(Number(res.body.data.id));

      const dup = await http().post('/v1/admin/coupons').set(as(superToken)).send(body);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');
      expectContract(dup);

      const over = await http()
        .post('/v1/admin/coupons')
        .set(as(superToken))
        .send({ ...body, code: `T${stamp}Y`, value: 150 });
      expect(over.status).toBe(400);

      const upd = await http()
        .put(`/v1/admin/coupons/${res.body.data.id}`)
        .set(as(superToken))
        .send({ ...body, value: 20 });
      expectContract(upd);
      expect(upd.body.data.value).toBe(20);

      const del = await http().delete(`/v1/admin/coupons/${res.body.data.id}`).set(as(superToken));
      expect(del.status).toBe(204);
      couponIds.pop();
    });

    it('banners: create, update, delete', async () => {
      const b = { title: `T${stamp}`, image_url: 'https://cdn.example/x.jpg', sort_order: 3 };
      const res = await http().post('/v1/admin/banners').set(as(superToken)).send(b);
      expect(res.status).toBe(201);
      expectContract(res);
      bannerIds.push(Number(res.body.data.id));
      const upd = await http()
        .put(`/v1/admin/banners/${res.body.data.id}`)
        .set(as(superToken))
        .send({ ...b, is_active: false });
      expectContract(upd);
      expect(upd.body.data.is_active).toBe(false);
      const list = await http().get('/v1/admin/banners').set(as(superToken));
      expectContract(list);
      expect(
        (await http().delete(`/v1/admin/banners/${res.body.data.id}`).set(as(superToken))).status,
      ).toBe(204);
    });
  });

  describe('admin accounts and roles', () => {
    it('creates a role and an admin with it; the new admin can log in with only those rights', async () => {
      const role = await http()
        .post('/v1/admin/roles')
        .set(as(superToken))
        .send({ name: `r_${stamp.toLowerCase()}`, permissions: ['users.read', 'payments.read'] });
      expect(role.status).toBe(201);
      expectContract(role);
      roleIds.push(Number(role.body.data.id));

      const email = `created${stamp}@admin.test`;
      const acc = await http()
        .post('/v1/admin/admins')
        .set(as(superToken))
        .send({ email, name: 'Created', role_id: role.body.data.id, password: PASS });
      expect(acc.status).toBe(201);
      expectContract(acc);
      expect(JSON.stringify(acc.body)).not.toContain('password');

      const login = await http().post('/v1/admin/auth/login').send({ email, password: PASS });
      const token = login.body.data.access_token as string;
      expect((await http().get('/v1/admin/users').set(as(token))).status).toBe(200);
      expect((await http().get('/v1/admin/audit-logs').set(as(token))).status).toBe(403);

      // widening the role takes effect without a new login
      const widen = await http()
        .put(`/v1/admin/roles/${role.body.data.id}`)
        .set(as(superToken))
        .send({ name: role.body.data.name, permissions: ['users.read', 'audit.read'] });
      expectContract(widen);
      expect((await http().get('/v1/admin/audit-logs').set(as(token))).status).toBe(200);

      const dup = await http()
        .post('/v1/admin/admins')
        .set(as(superToken))
        .send({ email, name: 'Again', role_id: role.body.data.id, password: PASS });
      expect(dup.status).toBe(409);

      const inUse = await http().delete(`/v1/admin/roles/${role.body.data.id}`).set(as(superToken));
      expect(inUse.status).toBe(409);
      expect(inUse.body.error.code).toBe('IN_USE');

      const del = await http().delete(`/v1/admin/admins/${acc.body.data.id}`).set(as(superToken));
      expect(del.status).toBe(204);
      expect((await http().get('/v1/admin/users').set(as(token))).status).toBe(401);
      expect(
        (await http().delete(`/v1/admin/roles/${role.body.data.id}`).set(as(superToken))).status,
      ).toBe(204);
      roleIds.pop();
    });

    it('blocks privilege escalation and self-lockout', async () => {
      // An admin who may manage admins but is not a super admin cannot hand out super_admin.
      const mid = await http()
        .post('/v1/admin/roles')
        .set(as(superToken))
        .send({ name: `m_${stamp.toLowerCase()}`, permissions: ['admins.read', 'admins.write'] });
      roleIds.push(Number(mid.body.data.id));
      const midAdmin = await http()
        .post('/v1/admin/admins')
        .set(as(superToken))
        .send({
          email: `created${stamp}m@admin.test`,
          name: 'Mid',
          role_id: mid.body.data.id,
          password: PASS,
        });
      const midLogin = await http()
        .post('/v1/admin/auth/login')
        .send({ email: `created${stamp}m@admin.test`, password: PASS });
      const midToken = midLogin.body.data.access_token as string;
      const superRole = await prisma.roles.findUniqueOrThrow({ where: { name: 'super_admin' } });
      const grab = await http()
        .post('/v1/admin/admins')
        .set(as(midToken))
        .send({
          email: `created${stamp}z@admin.test`,
          name: 'Z',
          role_id: String(superRole.id),
          password: PASS,
        });
      expect(grab.status).toBe(403);
      const selfUp = await http()
        .put(`/v1/admin/admins/${midAdmin.body.data.id}`)
        .set(as(midToken))
        .send({ email: `created${stamp}m@admin.test`, name: 'Mid', role_id: String(superRole.id) });
      expect(selfUp.status).toBe(403);

      // nobody deactivates or deletes their own account
      const me = await http().get('/v1/admin/me').set(as(superToken));
      const selfOff = await http()
        .put(`/v1/admin/admins/${superId}`)
        .set(as(superToken))
        .send({
          email: me.body.data.email,
          name: 'x',
          role_id: String(superRole.id),
          is_active: false,
        });
      expect(selfOff.status).toBe(409);
      expect((await http().delete(`/v1/admin/admins/${superId}`).set(as(superToken))).status).toBe(
        409,
      );

      // the super_admin role itself is fixed
      const edit = await http()
        .put(`/v1/admin/roles/${superRole.id}`)
        .set(as(superToken))
        .send({ name: 'super_admin', permissions: ['users.read'] });
      expect(edit.status).toBe(409);
      expect(
        (await http().delete(`/v1/admin/roles/${superRole.id}`).set(as(superToken))).status,
      ).toBe(409);
    });
  });

  describe('users and actions', () => {
    it('searches, shows detail and applies permission-checked actions', async () => {
      const phone = randomPhone();
      phones.push(phone);
      const u = await registerUser(app, phone);

      const found = await http().get(`/v1/admin/users?q=${phone}`).set(as(supportToken));
      expect(found.status).toBe(200);
      expectContract(found);
      expect(found.body.data).toHaveLength(1);
      expect(found.body.data[0].id).toBe(u.user.id);

      const detail = await http().get(`/v1/admin/users/${u.user.id}`).set(as(supportToken));
      expect(detail.status).toBe(200);
      expectContract(detail);
      expect(detail.body.data.devices).toHaveLength(1);
      expect((await http().get('/v1/admin/users/999999999999').set(as(supportToken))).status).toBe(
        404,
      );

      // support may reset devices but not ban or grant
      const reset = await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(supportToken))
        .send({ action: 'reset_device', reason: 'phone lost' });
      expect(reset.status).toBe(200);
      const afterReset = await http().get(`/v1/admin/users/${u.user.id}`).set(as(supportToken));
      expect(afterReset.body.data.devices.every((d: { is_active: boolean }) => !d.is_active)).toBe(
        true,
      );
      expect((await http().get('/v1/me').set(bearer(u.access_token))).status).toBe(401);

      const noBan = await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(supportToken))
        .send({ action: 'ban', reason: 'spam' });
      expect(noBan.status).toBe(403);

      const grant = await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(superToken))
        .send({ action: 'grant_subscription', days: 10, reason: 'giveaway' });
      expect(grant.status).toBe(200);
      const subs = await prisma.subscriptions.findMany({ where: { user_id: BigInt(u.user.id) } });
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({ source: 'manual', note: 'giveaway' });

      const ban = await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(superToken))
        .send({ action: 'ban', reason: 'abuse' });
      expect(ban.status).toBe(200);
      expect(
        (await prisma.users.findUniqueOrThrow({ where: { id: BigInt(u.user.id) } })).status,
      ).toBe('banned');
      await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(superToken))
        .send({ action: 'unban', reason: 'appeal' });
      expect(
        (await prisma.users.findUniqueOrThrow({ where: { id: BigInt(u.user.id) } })).status,
      ).toBe('active');

      const noReason = await http()
        .post(`/v1/admin/users/${u.user.id}/actions`)
        .set(as(superToken))
        .send({ action: 'ban' });
      expect(noReason.status).toBe(400);

      const logs = await http()
        .get(`/v1/admin/audit-logs?entity_type=user&entity_id=${u.user.id}`)
        .set(as(superToken));
      expect((logs.body.data as { action: string }[]).map((l) => l.action)).toEqual(
        expect.arrayContaining([
          'user.reset_device',
          'user.ban',
          'user.unban',
          'user.grant_subscription',
        ]),
      );
    });
  });

  describe('payments list and settings', () => {
    it('lists payments by status for roles that may read them', async () => {
      const res = await http().get('/v1/admin/payments?status=paid&limit=5').set(as(supportToken));
      expect(res.status).toBe(200);
      expectContract(res);
      expect(
        (await http().get('/v1/admin/payments?status=nope').set(as(supportToken))).status,
      ).toBe(400);
    });

    it('patches known settings, refuses unknown keys, and the change is live at once', async () => {
      const before = await http().get('/v1/admin/settings').set(as(superToken));
      expectContract(before);
      const old = before.body.data.trial_days as number;

      const bad = await http().patch('/v1/admin/settings').set(as(superToken)).send({ nope: 1 });
      expect(bad.status).toBe(400);
      expect(
        (await http().patch('/v1/admin/settings').set(as(supportToken)).send({ trial_days: 3 }))
          .status,
      ).toBe(403);

      const ok = await http()
        .patch('/v1/admin/settings')
        .set(as(superToken))
        .send({ trial_days: old + 1 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.trial_days).toBe(old + 1);
      const pub = await http().get('/v1/settings/public');
      expect(pub.body.data.trial_days).toBe(old + 1);

      await http().patch('/v1/admin/settings').set(as(superToken)).send({ trial_days: old });
    });
  });
});
