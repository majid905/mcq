import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// The deploy pipeline (.github/workflows/deploy.yml) builds with NEXT_OUTPUT=standalone and ships
// the self-contained server from .next/standalone. Off by default: it needs symlinks, which
// Windows only allows with developer mode, so a plain local `pnpm build` must not depend on it.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

// Shown in Settings (J4). Read as a file: JSON import attributes are not supported everywhere.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mcq/api-client-ts', '@mcq/ui'],
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // jsdom (DOMPurify on the server) reads files next to its own sources; bundling breaks that.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  ...(standalone && {
    output: 'standalone' as const,
    // Monorepo root, so the workspace packages above are traced into the bundle.
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  }),
};

export default withNextIntl(config);
