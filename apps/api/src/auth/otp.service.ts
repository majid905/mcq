import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { RedisService } from '../redis/redis.service';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms.provider';

export type OtpPurpose = 'register' | 'reset_password';

export const OTP_TTL_SEC = 300;
export const OTP_RESEND_SEC = 60;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
export const DEV_OTP_CODE = '123456';

interface StoredOtp {
  hash: string;
  attempts: number;
}

/** FR-AUTH-01/02/05: OTP in Redis (hashed), 5 min TTL, 5 verify attempts, per-phone and per-IP limits. */
@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly limits: RateLimitService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private key(purpose: OtpPurpose, phone: string) {
    return `otp:${purpose}:${phone}`;
  }

  private hash(code: string, phone: string, purpose: OtpPurpose): string {
    return createHmac('sha256', this.config.JWT_ACCESS_SECRET)
      .update(`${purpose}:${phone}:${code}`)
      .digest('hex');
  }

  /** Console driver (dev) always uses 123456 so web/mobile can log in without an SMS gateway. */
  private newCode(): string {
    return this.config.SMS_DRIVER === 'console'
      ? DEV_OTP_CODE
      : String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * Sends an OTP. `deliver=false` runs every limit and the cooldown but sends nothing: used for
   * reset_password on unknown numbers so the response never reveals whether a phone is registered.
   */
  async request(phone: string, purpose: OtpPurpose, ip: string, deliver = true) {
    // Cooldown first, so impatient resends do not burn the hourly budget.
    const k = this.key(purpose, phone);
    const ttl = await this.redis.client.ttl(k);
    const age = OTP_TTL_SEC - ttl;
    if (ttl > 0 && age < OTP_RESEND_SEC) {
      throw new ApiException('RATE_LIMITED', { retry_after_sec: OTP_RESEND_SEC - age });
    }
    await this.limits.assert(`otp:phone:${phone}`, 3, 3600);
    await this.limits.assert(`otp:ip:${ip}`, 10, 3600);

    // Undelivered requests still store a (random, unknowable) code so the cooldown and the
    // verify path behave identically for registered and unregistered numbers.
    const code = deliver ? this.newCode() : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const stored: StoredOtp = { hash: this.hash(code, phone, purpose), attempts: 0 };
    await this.redis.client.set(k, JSON.stringify(stored), 'EX', OTP_TTL_SEC);
    if (deliver) {
      await this.sms.send(phone, `আপনার ওটিপি কোড: ${code}। ৫ মিনিটের মধ্যে ব্যবহার করুন।`);
    }
    return { resend_after_sec: OTP_RESEND_SEC, expires_in_sec: OTP_TTL_SEC };
  }

  /** Checks the code; on success the OTP is consumed. Throws OTP_INVALID / OTP_EXPIRED. */
  async verify(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const k = this.key(purpose, phone);
    const raw = await this.redis.client.get(k);
    if (!raw) throw new ApiException('OTP_EXPIRED');

    const stored = JSON.parse(raw) as StoredOtp;
    const ttl = await this.redis.client.ttl(k);
    const expected = Buffer.from(stored.hash, 'hex');
    const actual = Buffer.from(this.hash(code, phone, purpose), 'hex');
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      await this.redis.client.del(k);
      return;
    }

    stored.attempts += 1;
    if (stored.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.redis.client.del(k);
      throw new ApiException('OTP_EXPIRED');
    }
    await this.redis.client.set(k, JSON.stringify(stored), 'EX', Math.max(ttl, 1));
    throw new ApiException('OTP_INVALID', {
      attempts_left: OTP_MAX_VERIFY_ATTEMPTS - stored.attempts,
    });
  }
}
