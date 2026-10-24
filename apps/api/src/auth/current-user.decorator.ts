import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: bigint;
  deviceRowId: bigint;
  premium: boolean;
}

export type AuthedRequest = Request & { user?: AuthUser };

/** `@CurrentUser() user: AuthUser` in a protected handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new Error('CurrentUser used on a route without JwtAuthGuard');
    return req.user;
  },
);
