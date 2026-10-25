import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mcq/api-client-ts', '@mcq/ui'],
};

export default withNextIntl(config);
