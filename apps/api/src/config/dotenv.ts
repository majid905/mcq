import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { repoRoot } from '../common/repo-root';

/**
 * Loads apps/api/.env, then the repo-root .env. Variables already set in the process win,
 * so real environment (CI, containers) always overrides files.
 * Assigns to process.env explicitly (process.loadEnvFile does not reach Jest's sandbox).
 */
export function loadDotenv(): void {
  const root = repoRoot();
  for (const file of [join(root, 'apps', 'api', '.env'), join(root, '.env')]) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  }
}
