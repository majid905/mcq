import { z } from 'zod';

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().startsWith('mysql://', 'must be a mysql:// URL'),
  REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must be a redis:// URL'),
  /** Reverse-proxy hops in front of the API (nginx = 1). Needed so req.ip, and so per-IP limits, are the client's. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  CORS_ORIGINS: csv.default(['http://localhost:3001', 'http://localhost:3002']),
  /** Override when the contract file is not found by walking up to the repo root. */
  OPENAPI_PATH: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
  /** Meilisearch for GET /search/questions. Unset = MySQL LIKE search (fine for small data only). */
  MEILI_URL: z.url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  /** `console` logs the OTP (dev only, fixed code 123456); `http` calls a Bangladeshi SMS gateway. */
  SMS_DRIVER: z.enum(['console', 'http']).default('console'),
  SMS_HTTP_URL: z.url().optional(),
  SMS_HTTP_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Cross-field rules, applied by parseEnv. */
function crossChecks(cfg: AppConfig): string[] {
  const problems: string[] = [];
  if (cfg.SMS_DRIVER === 'http' && !cfg.SMS_HTTP_URL) {
    problems.push('  - SMS_HTTP_URL: required when SMS_DRIVER=http');
  }
  if (cfg.NODE_ENV === 'production' && cfg.SMS_DRIVER === 'console') {
    problems.push(
      '  - SMS_DRIVER: "console" would log OTPs and accept 123456; not allowed in production',
    );
  }
  return problems;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Validates the environment once at startup; the message lists every problem. */
export function parseEnv(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  const problems = crossChecks(result.data);
  if (problems.length > 0) throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  return result.data;
}
