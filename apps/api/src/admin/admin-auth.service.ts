import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { sha256 } from '../auth/token.service';
import { PasswordService } from '../auth/password.service';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { newTotpSecret, openSecret, otpauthUrl, sealSecret, verifyTotp } from './totp';

export const ADMIN_ACCESS_TTL_SEC = 900;
/** docs/08 section 2: admin session timeout 8 h. */
export const ADMIN_REFRESH_TTL_SEC = 8 * 3600;
const CONTEXT_TTL_SEC = 30;
const LOGIN_WINDOW_SEC = 900;
const LOGIN_LIMIT_PER_EMAIL = 8;
const LOGIN_LIMIT_PER_IP = 30;

/** Everything a request handler needs to know about the signed-in admin. */
export interface AdminContext {
  id: bigint;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
}

export interface AdminProfileDto {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  totp_enabled: boolean;
}

interface AdminClaims {
  typ: 'admin';
  sub: string;
}

const ctxKey = (id: bigint | number | string) => `admin:ctx:${id}`;
const refreshKey = (token: string) => `admin:rt:${sha256(token)}`;
const totpPendingKey = (id: bigint) => `admin:totp:pending:${id}`;
const totpLastStepKey = (id: bigint) => `admin:totp:last:${id}`;

const toProfile = (c: AdminContext): AdminProfileDto => ({
  id: String(c.id),
  email: c.email,
  name: c.name,
  role: c.role,
  permissions: c.permissions,
  totp_enabled: c.totpEnabled,
});

/** FR-ADM-01: separate admin identity (email + password + TOTP), tokens that never work on student routes. */
@Injectable()
export class AdminAuthService {
  /** Verified against when the email is unknown, so response time does not reveal which emails exist. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly limits: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ------------------------------------------------------------------ session

  async login(email: string, password: string, totp: string | undefined, ip: string) {
    const normalized = email.trim().toLowerCase();
    await this.limits.assert(`adminlogin:ip:${ip}`, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW_SEC);
    const tries = await this.limits.hit(
      `adminlogin:email:${normalized}`,
      LOGIN_LIMIT_PER_EMAIL,
      LOGIN_WINDOW_SEC,
    );
    if (!tries.allowed) {
      throw new ApiException('ACCOUNT_LOCKED', {
        until: new Date(Date.now() + tries.retryAfterSec * 1000).toISOString(),
      });
    }

    const admin = await this.prisma.admins.findUnique({ where: { email: normalized } });
    this.dummyHash ??= this.passwords.hash('not-a-real-password');
    const ok = await this.passwords.verify(
      admin?.password_hash ?? (await this.dummyHash),
      password,
    );
    if (!admin || !ok || !admin.is_active) throw new ApiException('INVALID_CREDENTIALS');

    if (admin.totp_secret) {
      if (!totp) throw new ApiException('INVALID_CREDENTIALS', { totp_required: true });
      await this.assertTotp(
        BigInt(admin.id),
        openSecret(admin.totp_secret, this.config.JWT_ACCESS_SECRET),
        totp,
      );
    }

    await this.prisma.admins.update({
      where: { id: admin.id },
      data: { last_login_at: new Date() },
    });
    await this.redis.client.del(`rl:adminlogin:email:${normalized}`);
    return this.session(BigInt(admin.id));
  }

  async refresh(presented: string) {
    // GETDEL: a refresh token works exactly once; the next one replaces it.
    const raw = await this.redis.client.getdel(refreshKey(presented));
    if (!raw) throw new ApiException('UNAUTHENTICATED');
    return this.session(BigInt(raw));
  }

  async logout(presented: string): Promise<void> {
    await this.redis.client.del(refreshKey(presented));
  }

  private async session(adminId: bigint) {
    const ctx = await this.context(adminId, true);
    if (!ctx) throw new ApiException('UNAUTHENTICATED');
    const claims: AdminClaims = { typ: 'admin', sub: String(adminId) };
    const refresh = randomBytes(32).toString('base64url');
    await this.redis.client.set(refreshKey(refresh), String(adminId), 'EX', ADMIN_REFRESH_TTL_SEC);
    return {
      access_token: this.jwt.sign(claims, { expiresIn: ADMIN_ACCESS_TTL_SEC, algorithm: 'HS256' }),
      access_expires_in: ADMIN_ACCESS_TTL_SEC,
      refresh_token: refresh,
      admin: toProfile(ctx),
    };
  }

  // ------------------------------------------------------------------ request identity

  /** Id inside a valid admin access token, or null (also for student tokens). */
  verifyAccess(token: string): bigint | null {
    try {
      const c = this.jwt.verify<Partial<AdminClaims>>(token, { algorithms: ['HS256'] });
      return c.typ === 'admin' && typeof c.sub === 'string' && /^\d+$/.test(c.sub)
        ? BigInt(c.sub)
        : null;
    } catch {
      return null;
    }
  }

  /** Role and permissions, cached 30 s so a deactivated admin or changed role bites quickly. */
  async context(adminId: bigint, fresh = false): Promise<AdminContext | null> {
    if (!fresh) {
      const cached = await this.redis.client.get(ctxKey(adminId));
      if (cached)
        return this.revive(JSON.parse(cached) as Omit<AdminContext, 'id'> & { id: string });
    }
    const row = await this.prisma.admins.findUnique({
      where: { id: Number(adminId) },
      include: { roles: true },
    });
    if (!row?.is_active) return null;
    const ctx: AdminContext = {
      id: BigInt(row.id),
      email: row.email,
      name: row.name,
      role: row.roles.name,
      permissions: Array.isArray(row.roles.permissions) ? (row.roles.permissions as string[]) : [],
      totpEnabled: row.totp_secret !== null,
    };
    await this.redis.client.set(
      ctxKey(adminId),
      JSON.stringify({ ...ctx, id: String(ctx.id) }),
      'EX',
      CONTEXT_TTL_SEC,
    );
    return ctx;
  }

  private revive(c: Omit<AdminContext, 'id'> & { id: string }): AdminContext {
    return { ...c, id: BigInt(c.id) };
  }

  /** Call after changing an admin or a role so the next request sees it. */
  forget(adminId: bigint | number | string): Promise<unknown> {
    return this.redis.client.del(ctxKey(adminId));
  }

  async profile(adminId: bigint): Promise<AdminProfileDto> {
    const ctx = await this.context(adminId);
    if (!ctx) throw new ApiException('UNAUTHENTICATED');
    return toProfile(ctx);
  }

  // ------------------------------------------------------------------ TOTP enrolment

  async totpSetup(adminId: bigint) {
    const ctx = await this.context(adminId);
    if (!ctx) throw new ApiException('UNAUTHENTICATED');
    const secret = newTotpSecret();
    await this.redis.client.set(totpPendingKey(adminId), secret, 'EX', 600);
    return { secret, otpauth_url: otpauthUrl(secret, ctx.email, 'MCQ Admin') };
  }

  async totpEnable(adminId: bigint, code: string): Promise<void> {
    const secret = await this.redis.client.get(totpPendingKey(adminId));
    if (!secret)
      throw new ApiException('VALIDATION_FAILED', { fields: { code: 'start setup first' } });
    if (verifyTotp(secret, code) === null) {
      throw new ApiException('VALIDATION_FAILED', { fields: { code: 'wrong code' } });
    }
    await this.prisma.admins.update({
      where: { id: Number(adminId) },
      data: { totp_secret: sealSecret(secret, this.config.JWT_ACCESS_SECRET) },
    });
    await this.redis.client.del(totpPendingKey(adminId));
    await this.forget(adminId);
  }

  /** One code works once: replaying the previous step's code (shoulder-surfing, logs) is refused. */
  private async assertTotp(adminId: bigint, secret: string, code: string): Promise<void> {
    const step = verifyTotp(secret, code);
    if (step === null) throw new ApiException('INVALID_CREDENTIALS', { totp_required: true });
    const claimed = await this.redis.client.set(
      totpLastStepKey(adminId),
      String(step),
      'EX',
      120,
      'GET',
    );
    if (claimed !== null && Number(claimed) >= step) {
      throw new ApiException('INVALID_CREDENTIALS', { totp_required: true });
    }
  }
}
