import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { securityHeaders } from './common/security-headers';
import { requestContext } from './common/request-context.middleware';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { APP_CONFIG, type AppConfig } from './config/env';
import { mountDocs } from './docs/mount-docs';

export const API_PREFIX = 'v1';

/** Shared by main.ts and the contract tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.TRUST_PROXY > 0) {
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set(
      'trust proxy',
      config.TRUST_PROXY,
    );
  }
  (app.getHttpAdapter().getInstance() as { disable(k: string): void }).disable('x-powered-by');
  app.use(securityHeaders);
  app.use(requestContext);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'X-Server-Time', 'Retry-After'],
  });
  mountDocs(app, config.OPENAPI_PATH);
}
