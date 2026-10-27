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
  /** `console` only logs pushes (dev, staging); `fcm` sends through Firebase Cloud Messaging. */
  PUSH_DRIVER: z.enum(['console', 'fcm']).default('console'),
  /** Service account JSON (the whole file content) for PUSH_DRIVER=fcm. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  /** Meilisearch for GET /search/questions. Unset = MySQL LIKE search (fine for small data only). */
  MEILI_URL: z.url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  /** `console` logs the OTP (dev only, fixed code 123456); `http` calls a Bangladeshi SMS gateway. */
  SMS_DRIVER: z.enum(['console', 'http']).default('console'),
  SMS_HTTP_URL: z.url().optional(),
  SMS_HTTP_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  /** "fake" redirects straight back as paid/failed (dev, tests); "live" talks to bKash and SSLCommerz. */
  /** Optional wall for /admin: addresses or IPv4 ranges, e.g. "203.0.113.4,10.0.0.0/24". Empty = open. */
  ADMIN_IP_ALLOWLIST: csv.default([]),
  /** Admins must set up TOTP before they can do anything else. Defaults to on in production, off elsewhere. */
  ADMIN_REQUIRE_TOTP: z.stringbool().optional(),
  PAYMENT_DRIVER: z.enum(['fake', 'live']).default('fake'),
  /** Public base of this API, used to build the gateway callback URLs (e.g. https://mcq.ellevix.com). */
  PUBLIC_API_URL: z.url().default('http://localhost:3000'),
  /** Where the browser lands after paying: <WEB_BASE_URL>/payment/<id>/status. */
  WEB_BASE_URL: z.url().default('http://localhost:3001'),
  /** Deep-link scheme of the mobile app: <scheme>://payment/<id>. */
  APP_SCHEME: z.string().default('mcqapp'),
  /** Cloudflare R2 for uploads (images, import files). Unset = files go to UPLOAD_DIR on this server. */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  /** CDN host in front of the bucket; images are shown from here. */
  R2_PUBLIC_BASE_URL: z.url().optional(),
  UPLOAD_DIR: z.string().default('./.uploads'),
  SSLCOMMERZ_STORE_ID: z.string().optional(),
  SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
  /** Sandbox hosts are used unless this is true. */
  SSLCOMMERZ_LIVE: z.stringbool().default(false),
  BKASH_APP_KEY: z.string().optional(),
  BKASH_APP_SECRET: z.string().optional(),
  BKASH_USERNAME: z.string().optional(),
  BKASH_PASSWORD: z.string().optional(),
  BKASH_LIVE: z.stringbool().default(false),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Cross-field rules, applied by parseEnv. */
function crossChecks(cfg: AppConfig): string[] {
  const problems: string[] = [];
  if (cfg.SMS_DRIVER === 'http' && !cfg.SMS_HTTP_URL) {
    problems.push('  - SMS_HTTP_URL: required when SMS_DRIVER=http');
  }
  if (cfg.PUSH_DRIVER === 'fcm' && !cfg.FCM_SERVICE_ACCOUNT_JSON) {
    problems.push('  - FCM_SERVICE_ACCOUNT_JSON: required when PUSH_DRIVER=fcm');
  }
  const r2 = [cfg.R2_ACCOUNT_ID, cfg.R2_ACCESS_KEY_ID, cfg.R2_SECRET_ACCESS_KEY, cfg.R2_BUCKET];
  if (r2.some(Boolean) && !r2.every(Boolean)) {
    problems.push(
      '  - R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET: set all four or none',
    );
  }
  if (cfg.PAYMENT_DRIVER === 'live') {
    if (!cfg.SSLCOMMERZ_STORE_ID || !cfg.SSLCOMMERZ_STORE_PASSWORD) {
      problems.push(
        '  - SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD: required when PAYMENT_DRIVER=live',
      );
    }
    if (!cfg.BKASH_APP_KEY || !cfg.BKASH_APP_SECRET || !cfg.BKASH_USERNAME || !cfg.BKASH_PASSWORD) {
      problems.push(
        '  - BKASH_APP_KEY / APP_SECRET / USERNAME / PASSWORD: required when PAYMENT_DRIVER=live',
      );
    }
  }
  if (cfg.NODE_ENV === 'production' && cfg.JWT_ACCESS_SECRET.length < 32) {
    problems.push('  - JWT_ACCESS_SECRET: at least 32 characters in production');
  }
  if (cfg.NODE_ENV === 'production' && cfg.PAYMENT_DRIVER === 'fake') {
    problems.push(
      '  - PAYMENT_DRIVER: "fake" marks payments paid without money; not allowed in production',
    );
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
