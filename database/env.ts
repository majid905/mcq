import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Loads the repo-root .env if present; real environment variables win. */
export function loadEnv(): void {
  const file = `${REPO_ROOT}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}

export function dbConfig(asRoot = false) {
  return {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: asRoot ? 'root' : (process.env.MYSQL_USER ?? 'mcq'),
    password: asRoot
      ? (process.env.MYSQL_ROOT_PASSWORD ?? 'change-me-root')
      : (process.env.MYSQL_PASSWORD ?? 'change-me'),
    database: process.env.MYSQL_DATABASE ?? 'mcq',
    charset: 'utf8mb4',
    timezone: 'Z',
  };
}
