import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { Page } from './page';

/** Wraps every successful body as `{ data }` (or `{ data, meta }` for a Page). 204s pass through. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (res.statusCode === 204 || body === undefined) return body;
        if (body instanceof Page) return { data: body.items, meta: body.meta };
        return { data: body };
      }),
    );
  }
}
