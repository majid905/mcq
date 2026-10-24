import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ACCESS_TTL_SEC, TokenService } from './token.service';

export interface DeviceInfo {
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  model?: string | undefined;
  app_version?: string | undefined;
}

export const DEVICE_RESETS_PER_30D = 2;
const REVOKED_FLAG_TTL = ACCESS_TTL_SEC + 60;

/** FR-AUTH-07: one active mobile device + one active web browser per account. */
@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly limits: RateLimitService,
  ) {}

  static kindOf(platform: DeviceInfo['platform']): 'web' | 'mobile' {
    return platform === 'web' ? 'web' : 'mobile';
  }

  /**
   * Registers/reactivates this device and signs out any other active device of the same kind.
   * Returns the device row id (the `dev` claim in the access token).
   */
  async bind(userId: bigint, info: DeviceInfo): Promise<bigint> {
    const kind = DevicesService.kindOf(info.platform);
    const now = new Date();

    const { deviceId, kickedIds } = await this.prisma.$transaction(async (tx) => {
      const others = await tx.user_devices.findMany({
        where: { user_id: userId, kind, is_active: true, NOT: { device_id: info.device_id } },
        select: { id: true },
      });
      const ids = others.map((d) => d.id);
      if (ids.length > 0) {
        await tx.user_devices.updateMany({
          where: { id: { in: ids } },
          data: { is_active: false },
        });
        await tx.refresh_tokens.updateMany({
          where: { device_row_id: { in: ids }, revoked_at: null },
          data: { revoked_at: now },
        });
      }
      const device = await tx.user_devices.upsert({
        where: { user_id_device_id: { user_id: userId, device_id: info.device_id } },
        create: {
          user_id: userId,
          device_id: info.device_id,
          kind,
          platform: info.platform,
          model: info.model ?? null,
          app_version: info.app_version ?? null,
          last_seen_at: now,
        },
        update: {
          is_active: true,
          platform: info.platform,
          model: info.model ?? null,
          app_version: info.app_version ?? null,
          last_seen_at: now,
        },
      });
      return { deviceId: device.id, kickedIds: ids };
    });

    await this.redis.client.del(`dev:revoked:${deviceId}`);
    await this.flagRevoked(kickedIds);
    return deviceId;
  }

  /** Access tokens of signed-out devices stay cryptographically valid; this flag stops them early. */
  async flagRevoked(deviceRowIds: bigint[]): Promise<void> {
    if (deviceRowIds.length === 0) return;
    const pipeline = this.redis.client.pipeline();
    for (const id of deviceRowIds) pipeline.set(`dev:revoked:${id}`, '1', 'EX', REVOKED_FLAG_TTL);
    await pipeline.exec();
  }

  async isRevoked(deviceRowId: string): Promise<boolean> {
    return (await this.redis.client.exists(`dev:revoked:${deviceRowId}`)) === 1;
  }

  /** Sign out one device (logout). */
  async deactivate(deviceRowId: bigint): Promise<void> {
    await this.prisma.user_devices.updateMany({
      where: { id: deviceRowId },
      data: { is_active: false },
    });
    await this.tokens.revokeForDevices([deviceRowId]);
    await this.flagRevoked([deviceRowId]);
  }

  /** Sign out every device of a user (password reset). */
  async deactivateAll(userId: bigint): Promise<void> {
    const devices = await this.prisma.user_devices.findMany({
      where: { user_id: userId, is_active: true },
      select: { id: true },
    });
    const ids = devices.map((d) => d.id);
    await this.prisma.user_devices.updateMany({
      where: { user_id: userId },
      data: { is_active: false },
    });
    await this.tokens.revokeForUser(userId);
    await this.flagRevoked(ids);
  }

  /**
   * Self device reset (`POST /me/devices/reset`): signs out the user's other devices,
   * max 2 per 30 days, then support must do it (429 RATE_LIMITED).
   */
  async selfReset(userId: bigint, currentDeviceRowId: bigint): Promise<void> {
    const r = await this.limits.hit(`devreset:${userId}`, DEVICE_RESETS_PER_30D, 30 * 24 * 3600);
    if (!r.allowed) {
      throw new ApiException('RATE_LIMITED', { retry_after_sec: r.retryAfterSec });
    }
    const others = await this.prisma.user_devices.findMany({
      where: { user_id: userId, is_active: true, NOT: { id: currentDeviceRowId } },
      select: { id: true },
    });
    const ids = others.map((d) => d.id);
    await this.prisma.user_devices.updateMany({
      where: { id: { in: ids } },
      data: { is_active: false },
    });
    await this.tokens.revokeForDevices(ids);
    await this.flagRevoked(ids);
    await this.prisma.users.update({
      where: { id: userId },
      data: { device_resets_30d: Math.min(r.count, 255) },
    });
  }
}
