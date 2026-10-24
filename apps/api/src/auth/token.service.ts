import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import type { OtpPurpose } from './otp.service';

export const ACCESS_TTL_SEC = 900; // 15 min
export const REFRESH_TTL_SEC = 30 * 24 * 3600; // 30 days
export const VERIFICATION_TTL_SEC = 600; // 10 min

export interface AccessClaims {
  /** user id */
  sub: string;
  /** user_devices row id */
  dev: string;
  prem: boolean;
}

interface VerificationClaims {
  typ: 'otp-verified';
  phone: string;
  purpose: OtpPurpose;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- access token (JWT HS256, 15 min). Claims: docs/04-API.md section 2.
  signAccess(userId: bigint, deviceRowId: bigint, premium: boolean): string {
    const claims: AccessClaims = { sub: String(userId), dev: String(deviceRowId), prem: premium };
    return this.jwt.sign(claims, { expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });
  }

  /** Returns null for anything that is not a valid, unexpired access token. */
  verifyAccess(token: string): AccessClaims | null {
    try {
      const c = this.jwt.verify<Partial<AccessClaims> & { typ?: string }>(token, {
        algorithms: ['HS256'],
      });
      if (c.typ || typeof c.sub !== 'string' || typeof c.dev !== 'string') return null;
      return { sub: c.sub, dev: c.dev, prem: c.prem === true };
    } catch {
      return null;
    }
  }

  // ---- verification token: proves the phone passed OTP; 10 min; single purpose.
  signVerification(phone: string, purpose: OtpPurpose): string {
    const claims: VerificationClaims = { typ: 'otp-verified', phone, purpose };
    return this.jwt.sign(claims, { expiresIn: VERIFICATION_TTL_SEC, algorithm: 'HS256' });
  }

  verifyVerification(token: string, purpose: OtpPurpose): string {
    try {
      const c = this.jwt.verify<Partial<VerificationClaims>>(token, { algorithms: ['HS256'] });
      if (c.typ === 'otp-verified' && c.purpose === purpose && typeof c.phone === 'string') {
        return c.phone;
      }
    } catch {
      // fall through
    }
    throw new ApiException('OTP_EXPIRED');
  }

  // ---- refresh tokens: opaque random, stored as sha256, rotated on every use.
  async issueRefresh(
    userId: bigint,
    deviceRowId: bigint,
    familyId: string = randomUUID(),
  ): Promise<{ token: string; id: bigint }> {
    const token = randomBytes(32).toString('base64url');
    const row = await this.prisma.refresh_tokens.create({
      data: {
        user_id: userId,
        device_row_id: deviceRowId,
        family_id: familyId,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    });
    return { token, id: row.id };
  }

  /**
   * Rotation with reuse detection (FR-AUTH-06). A token that was already rotated or revoked
   * is evidence of theft: the whole family dies and the caller gets SESSION_REVOKED.
   */
  async rotateRefresh(
    presented: string,
  ): Promise<{ userId: bigint; deviceRowId: bigint; token: string }> {
    const row = await this.prisma.refresh_tokens.findUnique({
      where: { token_hash: sha256(presented) },
    });
    if (!row) throw new ApiException('UNAUTHENTICATED');

    if (row.revoked_at || row.replaced_by) {
      await this.revokeFamily(row.family_id);
      throw new ApiException('SESSION_REVOKED');
    }
    if (row.expires_at.getTime() <= Date.now()) throw new ApiException('UNAUTHENTICATED');

    const device = await this.prisma.user_devices.findUnique({ where: { id: row.device_row_id } });
    if (!device?.is_active) {
      await this.revokeFamily(row.family_id);
      throw new ApiException('SESSION_REVOKED');
    }

    const next = await this.prisma.$transaction(async (tx) => {
      // Atomic claim: of two concurrent refreshes with the same token only one wins.
      const claimed = await tx.refresh_tokens.updateMany({
        where: { id: row.id, revoked_at: null, replaced_by: null },
        data: { revoked_at: new Date() },
      });
      if (claimed.count === 0) return null;
      const token = randomBytes(32).toString('base64url');
      const created = await tx.refresh_tokens.create({
        data: {
          user_id: row.user_id,
          device_row_id: row.device_row_id,
          family_id: row.family_id,
          token_hash: sha256(token),
          expires_at: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
        },
      });
      await tx.refresh_tokens.update({ where: { id: row.id }, data: { replaced_by: created.id } });
      return token;
    });

    if (!next) {
      await this.revokeFamily(row.family_id);
      throw new ApiException('SESSION_REVOKED');
    }
    return { userId: row.user_id, deviceRowId: row.device_row_id, token: next };
  }

  revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refresh_tokens.updateMany({
      where: { family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  revokeForDevices(deviceRowIds: bigint[]): Promise<unknown> {
    if (deviceRowIds.length === 0) return Promise.resolve();
    return this.prisma.refresh_tokens.updateMany({
      where: { device_row_id: { in: deviceRowIds }, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  revokeForUser(userId: bigint): Promise<unknown> {
    return this.prisma.refresh_tokens.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}
