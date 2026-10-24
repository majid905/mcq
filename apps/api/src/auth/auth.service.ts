import { Injectable } from '@nestjs/common';
import { Prisma, type users } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { MeService, type MeDto } from '../me/me.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService, type DeviceInfo } from './devices.service';
import { OtpService, type OtpPurpose } from './otp.service';
import { PasswordService } from './password.service';
import { ACCESS_TTL_SEC, TokenService } from './token.service';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export interface AuthSessionDto {
  access_token: string;
  access_expires_in: number;
  refresh_token: string;
  user: MeDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly devices: DevicesService,
    private readonly me: MeService,
    private readonly limits: RateLimitService,
  ) {}

  // ---- OTP (FR-AUTH-01, 02, 05)
  async requestOtp(phone: string, purpose: OtpPurpose, ip: string) {
    const existing = await this.prisma.users.findUnique({ where: { phone }, select: { id: true } });
    if (purpose === 'register' && existing) throw new ApiException('PHONE_EXISTS');
    // reset_password for an unknown number answers exactly like a known one (no enumeration).
    return this.otp.request(phone, purpose, ip, purpose === 'register' || existing !== null);
  }

  async verifyOtp(phone: string, code: string, purpose: OtpPurpose) {
    await this.otp.verify(phone, code, purpose);
    return { verification_token: this.tokens.signVerification(phone, purpose) };
  }

  // ---- register (FR-AUTH-01)
  async register(
    verificationToken: string,
    name: string,
    password: string,
    device: DeviceInfo,
  ): Promise<AuthSessionDto> {
    const phone = this.tokens.verifyVerification(verificationToken, 'register');
    const passwordHash = await this.passwords.hash(password);
    let user: users;
    try {
      user = await this.prisma.users.create({
        data: {
          phone,
          name,
          password_hash: passwordHash,
          phone_verified_at: new Date(),
          last_active_at: new Date(),
          user_notification_prefs: { create: {} },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ApiException('PHONE_EXISTS');
      }
      throw e;
    }
    return this.createSession(user, device);
  }

  // ---- login with lockout (FR-AUTH-03)
  async login(phone: string, password: string, device: DeviceInfo, ip: string) {
    await this.limits.assert(`login:ip:${ip}`, 10, 60);

    const user = await this.prisma.users.findUnique({ where: { phone } });
    if (user?.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new ApiException('ACCOUNT_LOCKED', { until: user.locked_until.toISOString() });
    }

    const valid =
      user?.password_hash && user.status !== 'deleted'
        ? await this.passwords.verify(user.password_hash, password)
        : false;
    if (!user || !valid) {
      if (user) await this.recordFailedLogin(user);
      throw new ApiException('INVALID_CREDENTIALS');
    }
    if (user.status === 'banned') throw new ApiException('FORBIDDEN');

    const fresh = await this.prisma.users.update({
      where: { id: user.id },
      data: { failed_logins: 0, locked_until: null, last_active_at: new Date() },
    });
    return this.createSession(fresh, device);
  }

  private async recordFailedLogin(user: users): Promise<void> {
    const failed = user.failed_logins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.users.update({
      where: { id: user.id },
      data: lock
        ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { failed_logins: failed },
    });
  }

  // ---- refresh rotation (FR-AUTH-06)
  async refresh(presented: string): Promise<AuthSessionDto> {
    const { userId, deviceRowId, token } = await this.tokens.rotateRefresh(presented);
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return this.buildSession(user, deviceRowId, token);
  }

  async logout(deviceRowId: bigint): Promise<void> {
    await this.devices.deactivate(deviceRowId);
  }

  // ---- password reset (FR-AUTH-05): all sessions revoked
  async resetPassword(verificationToken: string, password: string): Promise<void> {
    const phone = this.tokens.verifyVerification(verificationToken, 'reset_password');
    const user = await this.prisma.users.findUnique({ where: { phone } });
    if (!user) throw new ApiException('OTP_EXPIRED');
    await this.prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash: await this.passwords.hash(password),
        failed_logins: 0,
        locked_until: null,
      },
    });
    await this.devices.deactivateAll(user.id);
  }

  // ---- sessions
  private async createSession(user: users, device: DeviceInfo): Promise<AuthSessionDto> {
    const deviceRowId = await this.devices.bind(user.id, device);
    const refresh = await this.tokens.issueRefresh(user.id, deviceRowId);
    return this.buildSession(user, deviceRowId, refresh.token);
  }

  private async buildSession(
    user: users,
    deviceRowId: bigint,
    refreshToken: string,
  ): Promise<AuthSessionDto> {
    const sub = await this.me.activeSubscription(user.id);
    return {
      access_token: this.tokens.signAccess(user.id, deviceRowId, sub !== null),
      access_expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshToken,
      user: await this.me.toMe(user),
    };
  }
}
