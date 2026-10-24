import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface SettingRow {
  value: unknown;
  is_public: boolean;
}

const CACHE_KEY = 'settings:all';
const CACHE_TTL_SEC = 60;

/** `app_settings` rows, cached in Redis for 60 s. Admin writes call invalidate(). */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async all(): Promise<Record<string, SettingRow>> {
    const cached = await this.redis.client.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Record<string, SettingRow>;
    const rows = await this.prisma.app_settings.findMany();
    const map: Record<string, SettingRow> = {};
    for (const r of rows) map[r.key] = { value: r.value, is_public: r.is_public };
    await this.redis.client.set(CACHE_KEY, JSON.stringify(map), 'EX', CACHE_TTL_SEC);
    return map;
  }

  async number(key: string, fallback: number): Promise<number> {
    const v = (await this.all())[key]?.value;
    return typeof v === 'number' ? v : fallback;
  }

  invalidate(): Promise<number> {
    return this.redis.client.del(CACHE_KEY);
  }
}
