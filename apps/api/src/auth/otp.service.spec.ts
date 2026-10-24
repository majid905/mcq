import { ApiException } from '../common/api-exception';
import type { RateLimitService } from '../common/rate-limit.service';
import type { AppConfig } from '../config/env';
import type { RedisService } from '../redis/redis.service';
import { DEV_OTP_CODE, OtpService, OTP_TTL_SEC } from './otp.service';
import type { SmsProvider } from './sms/sms.provider';

/** Minimal in-memory Redis with a controllable clock. */
class FakeRedis {
  now = 0;
  private data = new Map<string, { value: string; expiresAt: number }>();
  client = {
    get: (k: string) => Promise.resolve(this.read(k)),
    set: (k: string, v: string, _ex: 'EX', seconds: number) => {
      this.data.set(k, { value: v, expiresAt: this.now + seconds });
      return Promise.resolve('OK');
    },
    del: (k: string) => {
      this.data.delete(k);
      return Promise.resolve(1);
    },
    ttl: (k: string) => {
      const e = this.data.get(k);
      return Promise.resolve(e && e.expiresAt > this.now ? e.expiresAt - this.now : -2);
    },
  };
  private read(k: string) {
    const e = this.data.get(k);
    return e && e.expiresAt > this.now ? e.value : null;
  }
  raw(k: string) {
    return this.read(k);
  }
  advance(sec: number) {
    this.now += sec;
  }
}

class FakeLimits {
  private counts = new Map<string, number>();
  assert(key: string, limit: number): Promise<void> {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    if (n > limit) throw new ApiException('RATE_LIMITED', { retry_after_sec: 3600 });
    return Promise.resolve();
  }
}

function setup(driver: 'console' | 'http' = 'console') {
  const redis = new FakeRedis();
  const sent: { to: string; message: string }[] = [];
  const sms: SmsProvider = {
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve();
    },
  };
  const service = new OtpService(
    redis as unknown as RedisService,
    new FakeLimits() as unknown as RateLimitService,
    sms,
    { JWT_ACCESS_SECRET: 'unit-test-secret-0123456789', SMS_DRIVER: driver } as AppConfig,
  );
  const codeSent = () => /[0-9]{6}/.exec(sent.at(-1)?.message ?? '')?.[0] ?? '';
  return { redis, sent, service, codeSent };
}

const PHONE = '01712345678';
const code = async (p: Promise<unknown>) =>
  (await p.then(
    () => null,
    (e: unknown) => e,
  )) as ApiException | null;

describe('OtpService', () => {
  it('sends the dev code with the console driver and stores only a hash', async () => {
    const { service, sent, redis } = setup();
    await expect(service.request(PHONE, 'register', '1.1.1.1')).resolves.toEqual({
      resend_after_sec: 60,
      expires_in_sec: 300,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message).toContain(DEV_OTP_CODE);
    expect(redis.raw(`otp:register:${PHONE}`)).not.toContain(DEV_OTP_CODE);
  });

  it('uses a random 6-digit code with a real gateway driver', async () => {
    const { service, codeSent } = setup('http');
    await service.request(PHONE, 'register', '1.1.1.1');
    expect(codeSent()).toMatch(/^[0-9]{6}$/);
    await expect(service.verify(PHONE, codeSent(), 'register')).resolves.toBeUndefined();
  });

  it('enforces the 60 s resend cooldown, then allows a resend', async () => {
    const { service, redis } = setup();
    await service.request(PHONE, 'register', '1.1.1.1');
    const err = await code(service.request(PHONE, 'register', '1.1.1.1'));
    expect(err?.code).toBe('RATE_LIMITED');
    expect(err?.details?.retry_after_sec).toBeGreaterThan(0);
    redis.advance(61);
    await expect(service.request(PHONE, 'register', '1.1.1.1')).resolves.toBeDefined();
  });

  it('allows 3 requests per phone per hour, the 4th is RATE_LIMITED', async () => {
    const { service, redis } = setup();
    for (let i = 0; i < 3; i++) {
      await service.request(PHONE, 'register', `10.0.0.${i}`);
      redis.advance(61);
    }
    expect((await code(service.request(PHONE, 'register', '10.0.0.9')))?.code).toBe('RATE_LIMITED');
  });

  it('allows 10 requests per IP per hour, the 11th is RATE_LIMITED', async () => {
    const { service } = setup();
    for (let i = 0; i < 10; i++) {
      await service.request(`017000000${String(i).padStart(2, '0')}`, 'register', '9.9.9.9');
    }
    expect((await code(service.request('01799999999', 'register', '9.9.9.9')))?.code).toBe(
      'RATE_LIMITED',
    );
  });

  it('wrong codes count down; the 5th failure burns the OTP', async () => {
    const { service } = setup();
    await service.request(PHONE, 'register', '1.1.1.1');
    for (let left = 4; left >= 1; left--) {
      const err = await code(service.verify(PHONE, '000000', 'register'));
      expect(err?.code).toBe('OTP_INVALID');
      expect(err?.details?.attempts_left).toBe(left);
    }
    expect((await code(service.verify(PHONE, '000000', 'register')))?.code).toBe('OTP_EXPIRED');
    // even the right code is dead now
    expect((await code(service.verify(PHONE, DEV_OTP_CODE, 'register')))?.code).toBe('OTP_EXPIRED');
  });

  it('a correct code is consumed (single use) and the purpose must match', async () => {
    const { service } = setup();
    await service.request(PHONE, 'register', '1.1.1.1');
    expect((await code(service.verify(PHONE, DEV_OTP_CODE, 'reset_password')))?.code).toBe(
      'OTP_EXPIRED',
    );
    await expect(service.verify(PHONE, DEV_OTP_CODE, 'register')).resolves.toBeUndefined();
    expect((await code(service.verify(PHONE, DEV_OTP_CODE, 'register')))?.code).toBe('OTP_EXPIRED');
  });

  it('expires after 5 minutes', async () => {
    const { service, redis } = setup();
    await service.request(PHONE, 'register', '1.1.1.1');
    redis.advance(OTP_TTL_SEC + 1);
    expect((await code(service.verify(PHONE, DEV_OTP_CODE, 'register')))?.code).toBe('OTP_EXPIRED');
  });

  it('undelivered requests send nothing but still apply the cooldown', async () => {
    const { service, sent } = setup();
    await service.request(PHONE, 'reset_password', '1.1.1.1', false);
    expect(sent).toHaveLength(0);
    expect((await code(service.request(PHONE, 'reset_password', '1.1.1.1', false)))?.code).toBe(
      'RATE_LIMITED',
    );
    expect((await code(service.verify(PHONE, DEV_OTP_CODE, 'reset_password')))?.code).toBe(
      'OTP_INVALID',
    );
  });
});
