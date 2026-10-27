import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BillingJobsService } from '../../src/billing/billing-jobs.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { NotificationService } from '../../src/notifications/notification.service';
import { RedisService } from '../../src/redis/redis.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, expectContract } from './harness';
import { bearer, randomPhone, registerUser, type Session } from './helpers';

const DAY = 86_400_000;

describe('contract + integration: packages, coupons, checkout, payments, trial', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const phones: string[] = [];
  const packageIds: number[] = [];
  const couponIds: number[] = [];
  const stamp = Date.now().toString(36).toUpperCase();
  let monthly: number;
  let yearly: number;

  const http = () => request(app.getHttpServer());
  const newUser = async (): Promise<Session> => {
    const phone = randomPhone();
    phones.push(phone);
    await app.get(RateLimitService).reset('otp:ip');
    return registerUser(app, phone);
  };
  const makePackage = async (name: string, days: number, price: number) => {
    const p = await prisma.packages.create({
      data: {
        name_bn: name,
        name_en: name,
        duration_days: days,
        price_bdt: price,
        features: ['x'],
      },
    });
    packageIds.push(p.id);
    return p.id;
  };
  const makeCoupon = async (suffix: string, data: Record<string, unknown> = {}) => {
    const c = await prisma.coupons.create({
      data: { code: `T${stamp}${suffix}`, type: 'percent', value: 10, ...data },
    });
    couponIds.push(c.id);
    return c;
  };
  const checkout = (s: Session, body: Record<string, unknown>) =>
    http().post('/v1/payments/checkout').set(bearer(s.access_token)).send(body);
  /** Follow the fake gateway page: it is our own return URL with fake=paid. */
  const payAtGateway = async (redirectUrl: string, fake = 'paid') => {
    const u = new URL(redirectUrl);
    return http().get(`${u.pathname}?pid=${u.searchParams.get('pid')}&fake=${fake}`);
  };
  const subsOf = (s: Session) =>
    prisma.subscriptions.findMany({
      where: { user_id: BigInt(s.user.id) },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await app.get(RateLimitService).reset('');
    monthly = await makePackage(`T${stamp} মাসিক`, 30, 200);
    yearly = await makePackage(`T${stamp} বার্ষিক`, 365, 1500);
  });

  afterAll(async () => {
    const users = await prisma.users.findMany({
      where: { phone: { in: phones } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.notifications.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.coupon_redemptions.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.subscriptions.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.payments.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.coupons.deleteMany({ where: { id: { in: couponIds } } });
    await prisma.packages.deleteMany({ where: { id: { in: packageIds } } });
    await redis.client.del(...ids.map((id) => `user:${id}:sub`), 'noop');
    await app.close();
  });

  it('lists active packages publicly in the contract shape', async () => {
    const res = await http().get('/v1/packages');
    expect(res.status).toBe(200);
    expectContract(res);
    const mine = (res.body.data as { id: string; price_bdt: number }[]).find(
      (p) => p.id === String(monthly),
    );
    expect(mine?.price_bdt).toBe(200);

    await prisma.packages.update({ where: { id: yearly }, data: { is_active: false } });
    const after = await http().get('/v1/packages');
    expect((after.body.data as { id: string }[]).some((p) => p.id === String(yearly))).toBe(false);
    await prisma.packages.update({ where: { id: yearly }, data: { is_active: true } });
  });

  describe('coupons', () => {
    it('prices a percent coupon and rejects every bad code with the same error', async () => {
      const s = await newUser();
      const ok = await makeCoupon('OK', { max_discount_bdt: 15 });
      const good = await http()
        .post('/v1/coupons/validate')
        .set(bearer(s.access_token))
        .send({ code: ok.code.toLowerCase(), package_id: String(monthly) });
      expect(good.status).toBe(200);
      expectContract(good);
      expect(good.body.data).toEqual({ discount_bdt: 15, payable_bdt: 185 });

      const expired = await makeCoupon('OLD', { ends_at: new Date(Date.now() - 1000) });
      const future = await makeCoupon('NEW', { starts_at: new Date(Date.now() + DAY) });
      const off = await makeCoupon('OFF', { is_active: false });
      const used = await makeCoupon('USED', { usage_limit: 1, used_count: 1 });
      const other = await makeCoupon('PKG', { package_ids: [yearly] });
      for (const code of [
        expired.code,
        future.code,
        off.code,
        used.code,
        other.code,
        'NOPE-NOPE',
      ]) {
        const r = await http()
          .post('/v1/coupons/validate')
          .set(bearer(s.access_token))
          .send({ code, package_id: String(monthly) });
        expect(r.status).toBe(422);
        expect(r.body.error.code).toBe('COUPON_INVALID');
        expectContract(r);
      }
    });

    it('enforces the per-user limit once a payment used the coupon', async () => {
      const s = await newUser();
      const c = await makeCoupon('ONCE', { per_user_limit: 1 });
      const res = await checkout(s, {
        package_id: String(monthly),
        gateway: 'bkash',
        coupon_code: c.code,
      });
      expect(res.status).toBe(201);
      await payAtGateway(res.body.data.redirect_url);

      const again = await http()
        .post('/v1/coupons/validate')
        .set(bearer(s.access_token))
        .send({ code: c.code, package_id: String(monthly) });
      expect(again.status).toBe(422);
      const row = await prisma.coupons.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.used_count).toBe(1);
    });
  });

  describe('checkout and settlement', () => {
    it('checkout -> gateway -> return grants premium once', async () => {
      const s = await newUser();
      const c = await makeCoupon('TEN');
      const res = await checkout(s, {
        package_id: String(monthly),
        gateway: 'sslcommerz',
        coupon_code: c.code,
      });
      expect(res.status).toBe(201);
      expectContract(res);
      expect(res.body.data.payable_bdt).toBe(180);

      const pending = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(s.access_token));
      expectContract(pending);
      expect(pending.body.data.status).toBe('pending');
      expect(await subsOf(s)).toHaveLength(0);

      const back = await payAtGateway(res.body.data.redirect_url);
      expect(back.status).toBe(302);
      expect(back.headers['location']).toMatch(
        new RegExp(`/payment/${res.body.data.payment_id}/status$`),
      );

      const paid = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(s.access_token));
      expectContract(paid);
      expect(paid.body.data).toMatchObject({ status: 'paid', amount_bdt: 180, discount_bdt: 20 });
      expect(paid.body.data.paid_at).not.toBeNull();

      const subs = await subsOf(s);
      expect(subs).toHaveLength(1);
      expect(subs[0]?.source).toBe('payment');
      expect(subs[0]!.ends_at.getTime() - subs[0]!.starts_at.getTime()).toBe(30 * DAY);

      const me = await http().get('/v1/me').set(bearer(s.access_token));
      expect(me.body.data.subscription.is_premium).toBe(true);
      expect(me.body.data.subscription.source).toBe('payment');

      const history = await http().get('/v1/payments/history').set(bearer(s.access_token));
      expect(history.status).toBe(200);
      expectContract(history);
      expect(history.body.data).toHaveLength(1);

      const note = await prisma.notifications.findFirst({
        where: { user_id: BigInt(s.user.id), type: 'subscription' },
      });
      expect(note).not.toBeNull();
    });

    it('duplicate returns and IPNs (even in parallel) never create a second subscription', async () => {
      const s = await newUser();
      const c = await makeCoupon('DUP');
      const res = await checkout(s, {
        package_id: String(monthly),
        gateway: 'bkash',
        coupon_code: c.code,
      });
      const pid = res.body.data.payment_id as string;
      const pay = await prisma.payments.findUniqueOrThrow({ where: { id: BigInt(pid) } });

      const calls = [
        ...Array.from({ length: 4 }, () => payAtGateway(res.body.data.redirect_url)),
        ...Array.from({ length: 4 }, () =>
          http()
            .post('/v1/payments/webhooks/bkash')
            .type('form')
            .send({ merchantInvoiceNumber: pay.merchant_tran_id, fake: 'paid' }),
        ),
      ];
      const results = await Promise.all(calls);
      for (const r of results) expect([200, 302]).toContain(r.status);

      expect(await subsOf(s)).toHaveLength(1);
      expect(await prisma.coupon_redemptions.count({ where: { payment_id: BigInt(pid) } })).toBe(1);
      expect((await prisma.coupons.findUniqueOrThrow({ where: { id: c.id } })).used_count).toBe(1);
    });

    it('a failed payment grants nothing; a late confirmation still activates it', async () => {
      const s = await newUser();
      const res = await checkout(s, { package_id: String(monthly), gateway: 'sslcommerz' });
      await payAtGateway(res.body.data.redirect_url, 'failed');
      const failed = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(s.access_token));
      expect(failed.body.data.status).toBe('failed');
      expect(await subsOf(s)).toHaveLength(0);

      await payAtGateway(res.body.data.redirect_url, 'paid');
      const late = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(s.access_token));
      expect(late.body.data.status).toBe('paid');
      expect(await subsOf(s)).toHaveLength(1);
    });

    it('a cancelled return marks the payment cancelled', async () => {
      const s = await newUser();
      const res = await checkout(s, { package_id: String(monthly), gateway: 'bkash' });
      await payAtGateway(res.body.data.redirect_url, 'cancelled');
      const r = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(s.access_token));
      expect(r.body.data.status).toBe('cancelled');
    });

    it('stacks a renewal behind the current subscription', async () => {
      const s = await newUser();
      for (const pkg of [monthly, yearly]) {
        const res = await checkout(s, { package_id: String(pkg), gateway: 'bkash' });
        await payAtGateway(res.body.data.redirect_url);
      }
      const [first, second] = await subsOf(s);
      expect(second!.starts_at.getTime()).toBe(first!.ends_at.getTime());
      expect(second!.ends_at.getTime() - second!.starts_at.getTime()).toBe(365 * DAY);
    });

    it('a 100% coupon activates immediately without a gateway', async () => {
      const s = await newUser();
      const c = await makeCoupon('FREE', { type: 'fixed', value: 500 });
      const res = await checkout(s, {
        package_id: String(monthly),
        gateway: 'bkash',
        coupon_code: c.code,
        return_platform: 'android',
      });
      expect(res.status).toBe(201);
      expectContract(res);
      expect(res.body.data.payable_bdt).toBe(0);
      expect(res.body.data.redirect_url).toMatch(/^mcqapp:\/\/payment\/\d+$/);
      expect(await subsOf(s)).toHaveLength(1);
    });

    it('hides other people payments and rejects bad input', async () => {
      const a = await newUser();
      const b = await newUser();
      const res = await checkout(a, { package_id: String(monthly), gateway: 'bkash' });
      const peek = await http()
        .get(`/v1/payments/${res.body.data.payment_id}`)
        .set(bearer(b.access_token));
      expect(peek.status).toBe(404);

      expect((await checkout(a, { package_id: '999999999', gateway: 'bkash' })).status).toBe(404);
      expect((await checkout(a, { package_id: String(monthly), gateway: 'paypal' })).status).toBe(
        400,
      );
      expect((await http().post('/v1/payments/checkout').send({})).status).toBe(401);
    });

    it('acknowledges webhooks for unknown payments without side effects', async () => {
      const r = await http().post('/v1/payments/webhooks/sslcommerz').type('form').send({
        tran_id: '00000000000000000000000000',
        fake: 'paid',
      });
      expect(r.status).toBe(200);
      expect((await http().post('/v1/payments/webhooks/paypal').send({})).status).toBe(404);
    });
  });

  describe('free trial', () => {
    it('starts once, then refuses', async () => {
      const s = await newUser();
      const res = await http().post('/v1/me/trial').set(bearer(s.access_token));
      expect(res.status).toBe(200);
      expectContract(res);
      expect(res.body.data).toMatchObject({
        is_premium: true,
        source: 'trial',
        trial_available: false,
      });
      const subs = await subsOf(s);
      expect(subs).toHaveLength(1);
      expect(subs[0]?.package_id).toBeNull();

      const again = await http().post('/v1/me/trial').set(bearer(s.access_token));
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('TRIAL_USED');
      expectContract(again);
    });

    it('two parallel taps give one trial', async () => {
      const s = await newUser();
      const rs = await Promise.all([
        http().post('/v1/me/trial').set(bearer(s.access_token)),
        http().post('/v1/me/trial').set(bearer(s.access_token)),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await subsOf(s)).toHaveLength(1);
    });
  });

  describe('expiry reminders (FR-PAY-05)', () => {
    it('sends one reminder per tier and skips users who already renewed', async () => {
      const jobs = new BillingJobsService(prisma, redis, app.get(NotificationService));
      const soon = await newUser();
      const renewed = await newUser();
      const mk = (u: Session, endsInDays: number) =>
        prisma.subscriptions.create({
          data: {
            user_id: BigInt(u.user.id),
            source: 'manual',
            starts_at: new Date(Date.now() - 10 * DAY),
            ends_at: new Date(Date.now() + endsInDays * DAY),
          },
        });
      await mk(soon, 2);
      await mk(renewed, 2);
      await mk(renewed, 40);

      await jobs.sendExpiryReminders(new Date());
      await jobs.sendExpiryReminders(new Date());
      const inbox = (u: Session) =>
        prisma.notifications.findMany({
          where: { user_id: BigInt(u.user.id), type: 'subscription' },
        });
      expect(await inbox(soon)).toHaveLength(1);
      expect((await inbox(soon))[0]?.deep_link).toBe('/plans');
      expect(await inbox(renewed)).toHaveLength(0);
    });
  });
});
