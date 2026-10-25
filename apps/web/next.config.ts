import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// The deploy pipeline (.github/workflows/deploy.yml) builds with NEXT_OUTPUT=standalone and ships
// the self-contained server from .next/standalone. Off by default: it needs symlinks, which
// Windows only allows with developer mode, so a plain local `pnpm build` must not depend on it.
const standalone = process.env.NEXT_OUTPUT === 'standalone';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mcq/api-client-ts', '@mcq/ui'],
  ...(standalone && {
    output: 'standalone' as const,
    // Monorepo root, so the workspace packages above are traced into the bundle.
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  }),
};

export default withNextIntl(config);
