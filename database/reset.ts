// pnpm db:reset  -> drop DB, apply schema.sql, (prisma db pull + generate when apps/api has Prisma), seed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { REPO_ROOT, dbConfig, loadEnv } from './env';
import { seed } from './seed/index';

loadEnv();

const cfg = dbConfig(true);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'mysql']);

if (cfg.database !== 'mcq') {
  // schema.sql hardcodes `CREATE DATABASE mcq` / `USE mcq`.
  throw new Error(
    `MYSQL_DATABASE must be "mcq" (schema.sql is bound to it), got "${cfg.database}"`,
  );
}
if (process.env.NODE_ENV === 'production' || !LOCAL_HOSTS.has(cfg.host)) {
  if (!process.argv.includes('--force')) {
    throw new Error(
      `Refusing to drop database "${cfg.database}" on ${cfg.host} (NODE_ENV=${process.env.NODE_ENV}). Pass --force if you really mean it.`,
    );
  }
}

const root = await mysql.createConnection({
  ...cfg,
  database: undefined,
  multipleStatements: true,
});
try {
  console.log(`Dropping and recreating "${cfg.database}" on ${cfg.host}:${cfg.port}`);
  await root.query(`DROP DATABASE IF EXISTS \`${cfg.database}\``);
  await root.query(readFileSync(`${REPO_ROOT}database/schema.sql`, 'utf8'));
  console.log('Applied database/schema.sql');
} finally {
  await root.end();
}

// Added by the api-scaffold PR: once apps/api has a Prisma schema, refresh the client.
if (existsSync(`${REPO_ROOT}apps/api/prisma`)) {
  for (const cmd of ['db pull', 'generate']) {
    const res = spawnSync(`pnpm --filter @mcq/api exec prisma ${cmd}`, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (res.status !== 0) process.exit(res.status ?? 1);
  }
}

const conn = await mysql.createConnection(dbConfig(true));
try {
  await conn.query('USE `mcq`');
  await seed(conn);
} finally {
  await conn.end();
}
