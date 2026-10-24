import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { DevicesService } from '../auth/devices.service';
import { ApiException } from '../common/api-exception';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { MeService } from './me.service';
import { meUpdateSchema, pushTokenSchema, type MeUpdateDto, type PushTokenDto } from './me.schemas';

@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  private async currentUser(auth: AuthUser) {
    const user = await this.prisma.users.findUnique({ where: { id: auth.userId } });
    if (!user || user.status !== 'active') throw new ApiException('SESSION_REVOKED');
    return user;
  }

  @Get()
  async get(@CurrentUser() auth: AuthUser) {
    return this.me.toMe(await this.currentUser(auth));
  }

  /** FR-AUTH-08/09: onboarding choices and profile preferences. */
  @Patch()
  async update(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(meUpdateSchema)) dto: MeUpdateDto,
  ) {
    await this.currentUser(auth);
    const fields: Record<string, string> = {};

    if (dto.district_id !== undefined) {
      const exists = await this.prisma.districts.count({ where: { id: dto.district_id } });
      if (!exists) fields.district_id = 'unknown district';
    }
    if (dto.target_node_ids !== undefined) {
      const ids = [...new Set(dto.target_node_ids)].map(Number);
      const valid = await this.prisma.taxonomy_nodes.count({
        where: { id: { in: ids }, type: 'category', is_active: true },
      });
      if (valid !== ids.length) fields.target_node_ids = 'must be active exam categories';
    }
    if (Object.keys(fields).length > 0) throw new ApiException('VALIDATION_FAILED', { fields });

    const user = await this.prisma.users.update({
      where: { id: auth.userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.avatar_url !== undefined && { avatar_url: dto.avatar_url }),
        ...(dto.district_id !== undefined && { district_id: dto.district_id }),
        ...(dto.target_node_ids !== undefined && {
          target_node_ids: [...new Set(dto.target_node_ids)],
        }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.theme !== undefined && { theme: dto.theme }),
      },
    });
    return this.me.toMe(user);
  }

  /**
   * FR-AUTH-10: account deletion request. The account is closed and every session revoked now;
   * anonymisation of personal data runs within 30 days (scheduler job, later phase).
   */
  @Delete()
  @HttpCode(202)
  async remove(@CurrentUser() auth: AuthUser): Promise<void> {
    await this.prisma.users.update({
      where: { id: auth.userId },
      data: { status: 'deleted', deleted_at: new Date() },
    });
    await this.devices.deactivateAll(auth.userId);
  }

  /** FR-AUTH-07: sign out my other devices; 2 per 30 days, then 429 and support has to do it. */
  @Post('devices/reset')
  @HttpCode(204)
  async resetDevices(@CurrentUser() auth: AuthUser): Promise<void> {
    await this.devices.selfReset(auth.userId, auth.deviceRowId);
  }

  @Put('push-token')
  @HttpCode(204)
  async pushToken(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodValidationPipe(pushTokenSchema)) dto: PushTokenDto,
  ): Promise<void> {
    // An FCM token belongs to one device: clear it elsewhere before assigning.
    await this.prisma.user_devices.updateMany({
      where: { push_token: dto.token, NOT: { id: auth.deviceRowId } },
      data: { push_token: null },
    });
    await this.prisma.user_devices.update({
      where: { id: auth.deviceRowId },
      data: { push_token: dto.token },
    });
  }
}
