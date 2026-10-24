import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api-exception';
import { RateLimitService } from '../common/rate-limit.service';
import { type AuthedRequest } from './current-user.decorator';
import { DevicesService } from './devices.service';
import { IS_PUBLIC } from './public.decorator';
import { TokenService } from './token.service';

/**
 * Global guard: every route needs `Authorization: Bearer <access token>` unless marked @Public().
 * Also enforces the default authenticated limit of 120 requests / user / minute (docs/04 section 5).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly devices: DevicesService,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const claims = token ? this.tokens.verifyAccess(token) : null;
    if (!claims) throw new ApiException('UNAUTHENTICATED');

    if (await this.devices.isRevoked(claims.dev)) throw new ApiException('SESSION_REVOKED');
    await this.limits.assert(`user:${claims.sub}`, 120, 60);

    req.user = {
      userId: BigInt(claims.sub),
      deviceRowId: BigInt(claims.dev),
      premium: claims.prem,
    };
    return true;
  }
}
