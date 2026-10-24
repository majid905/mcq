import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { SkipGate } from '../gate/skip-gate.decorator';
import { SettingsService } from './settings.service';

export interface PublicSettingsDto {
  server_time: string;
  min_supported_version: { android: string; ios: string };
  maintenance: { enabled: boolean; message_bn: string; message_en: string };
  free_live_exams_per_month: number;
  free_practice_per_day: number;
  trial_days: number;
  support_phone: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public and exempt from the maintenance/version gate: clients read it to learn *why* they are blocked. */
  @Public()
  @SkipGate()
  @Get('public')
  @Header('Cache-Control', 'public, max-age=30')
  async publicSettings(): Promise<PublicSettingsDto> {
    const s = await this.settings.all();
    const get = <T>(key: string, fallback: T): T => {
      const row = s[key];
      return row?.is_public && row.value !== null && row.value !== undefined
        ? (row.value as T)
        : fallback;
    };
    const maintenance = get<Partial<PublicSettingsDto['maintenance']>>('maintenance', {});
    const min = get<Partial<PublicSettingsDto['min_supported_version']>>(
      'min_supported_version',
      {},
    );
    return {
      server_time: new Date().toISOString(),
      min_supported_version: { android: min.android ?? '1.0.0', ios: min.ios ?? '1.0.0' },
      maintenance: {
        enabled: maintenance.enabled === true,
        message_bn: maintenance.message_bn ?? '',
        message_en: maintenance.message_en ?? '',
      },
      free_live_exams_per_month: get('free_live_exams_per_month', 4),
      free_practice_per_day: get('free_practice_per_day', 50),
      trial_days: get('trial_days', 7),
      support_phone: get('support_phone', ''),
    };
  }
}
