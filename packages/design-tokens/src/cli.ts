// pnpm tokens:gen -> dist/tokens.css, dist/theme.css (Tailwind v4) and the Flutter tokens.g.dart.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_TEXT_CONTRAST, checkContrast } from './contrast';
import { buildCss, buildTailwindTheme } from './css';
import { DART_OUT, buildDart } from './dart';
import { REPO_ROOT, loadTokens } from './tokens';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = loadTokens();

const failing = checkContrast(tokens).filter((r) => r.ratio < MIN_TEXT_CONTRAST);
for (const r of failing) {
  console.warn(
    `contrast ${r.mode} ${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)} < ${MIN_TEXT_CONTRAST}`,
  );
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  process.stdout.write(`wrote ${path.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')}\n`);
}

write(join(PKG, 'dist', 'tokens.css'), buildCss(tokens));
write(join(PKG, 'dist', 'theme.css'), buildTailwindTheme(tokens));
write(join(REPO_ROOT, DART_OUT), buildDart(tokens));
