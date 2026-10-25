// Creates N load-test students straight in MySQL and writes their access tokens to
// load/tokens.json for k6. Going through OTP/register would hit the per-IP OTP limit (10/hour).
//
//   node load/seed-users.mjs 200            # create/refresh 200 users, tokens valid for 1 hour
//   node load/seed-users.mjs --cleanup      # delete every load-test user and their attempts
//
// Load-test phones are 0199xxxxxxx. Never run this against a database with real users in the
// 0199 range. Needs MYSQL_* / DATABASE_URL and JWT_ACCESS_SECRET in .env (same as the API).
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    process.env[k] ??= v;
  }
}
const require = createRequire(join(root, 'database', 'package.json'));
const mysql = require('mysql2/promise');

const secret = process.env.JWT_ACCESS_SECRET;
if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
const url = new URL(process.env.DATABASE_URL ?? 'mysql://mcq:change-me@127.0.0.1:3306/mcq');
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  timezone: 'Z',
});

const PREFIX = '0199';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

if (process.argv.includes('--cleanup')) {
  const [rows] = await db.query('SELECT id FROM users WHERE phone LIKE ?', [`${PREFIX}%`]);
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.query('DELETE FROM attempts WHERE user_id IN (?)', [ids]);
    await db.query('DELETE FROM users WHERE id IN (?)', [ids]); // devices and tokens cascade
  }
  console.log(`removed ${ids.length} load-test users`);
  await db.end();
  process.exit(0);
}

const n = Number(process.argv[2] ?? 100);
if (!Number.isInteger(n) || n < 1 || n > 20000) throw new Error('usage: seed-users.mjs <1..20000>');

const tokens = [];
const exp = Math.floor(Date.now() / 1000) + 3600;
for (let i = 0; i < n; i++) {
  const phone = `${PREFIX}${String(i).padStart(7, '0')}`;
  await db.query(
    `INSERT INTO users (phone, phone_verified_at, name, locale, district_id, status)
     VALUES (?, NOW(3), ?, 'bn', ?, 'active')
     ON DUPLICATE KEY UPDATE status = 'active'`,
    [phone, `Load ${i}`, (i % 64) + 1],
  );
  const [[user]] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
  await db.query(
    `INSERT INTO user_devices (user_id, device_id, kind, platform, model, app_version, is_active)
     VALUES (?, ?, 'web', 'web', 'k6', '1.0.0', 1)
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [user.id, `k6-${i}`],
  );
  const [[dev]] = await db.query(
    'SELECT id FROM user_devices WHERE user_id = ? AND device_id = ?',
    [user.id, `k6-${i}`],
  );
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: String(user.id), dev: String(dev.id), prem: false, iat: exp - 3600, exp });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  tokens.push(`${head}.${body}.${sig}`);
}
writeFileSync(join(root, 'load', 'tokens.json'), JSON.stringify(tokens));
console.log(`wrote ${tokens.length} tokens to load/tokens.json (valid 1 hour)`);
await db.end();
