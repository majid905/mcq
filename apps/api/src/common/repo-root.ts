import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

let cached: string | undefined;

/** Walks up from this file to the directory holding pnpm-workspace.yaml. */
export function repoRoot(): string {
  if (cached) return cached;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return (cached = dir);
    dir = dirname(dir);
  }
  throw new Error('Repo root (pnpm-workspace.yaml) not found');
}
