import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule as PinoModule } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config/env';

/** Structured JSON logs (Pino). Request id comes from requestContext; auth headers are redacted. */
export const LoggerModule = PinoModule.forRootAsync({
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => ({
    pinoHttp: {
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      genReqId: (req: IncomingMessage) =>
        (req as IncomingMessage & { id?: string }).id ?? randomUUID(),
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/v1/health' },
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } }
          : undefined,
    },
  }),
});
