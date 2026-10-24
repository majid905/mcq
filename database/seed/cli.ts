// pnpm --filter @mcq/database seed  -> seed an already-created, empty schema.
import mysql from 'mysql2/promise';
import { dbConfig, loadEnv } from '../env';
import { seed } from './index';

loadEnv();
const conn = await mysql.createConnection(dbConfig(true));
try {
  await conn.query('USE `mcq`');
  await seed(conn);
} finally {
  await conn.end();
}
