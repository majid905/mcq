import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../common/api-exception';
import { pickLocale } from '../common/http-exception.filter';
import { SettingsService } from '../settings/settings.service';
import { SKIP_GATE } from './skip-gate.decorator';

/** Compares dotted numeric versions: 1.10.0 > 1.9.3. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

interface MaintenanceSetting {
  enabled?: boolean;
  message_bn?: string;
  message_en?: string;
}

/**
 * Global gate, runs before auth:
 * - maintenance mode on  -> 503 MAINTENANCE (admin routes stay open so staff can switch it off)
 * - X-Platform android|ios with X-App-Version below the minimum -> 426 UPGRADE_REQUIRED
 * Web requests and requests without version headers are never blocked by the version rule.
 */
@Injectable()
export class AppGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_GATE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const all = await this.settings.all();

    const maintenance = (all['maintenance']?.value ?? {}) as MaintenanceSetting;
    if (maintenance.enabled === true && !req.path.startsWith('/v1/admin')) {
      const locale = pickLocale(req.headers['accept-language']);
      const custom = locale === 'en' ? maintenance.message_en : maintenance.message_bn;
      throw new ApiException('MAINTENANCE', undefined, custom || undefined);
    }

    const platform = req.headers['x-platform'];
    const version = req.headers['x-app-version'];
    if ((platform === 'android' || platform === 'ios') && typeof version === 'string') {
      const min = (all['min_supported_version']?.value ?? {}) as Record<string, string | undefined>;
      const required = min[platform];
      if (required && compareVersions(version, required) < 0) {
        throw new ApiException('UPGRADE_REQUIRED', { min_version: required, platform });
      }
    }
    return true;
  }
}
