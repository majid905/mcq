import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import pkg from './package.json' with { type: 'json' };

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mcq/api-client-ts', '@mcq/ui'],
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default withNextIntl(config);
