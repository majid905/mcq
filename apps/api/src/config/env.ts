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
  CORS_ORIGINS: csv.default(['http://localhost:3001', 'http://localhost:3002']),
  /** Override when the contract file is not found by walking up to the repo root. */
  OPENAPI_PATH: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

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
  return result.data;
}
