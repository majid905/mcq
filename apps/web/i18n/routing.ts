import { defineRouting } from 'next-intl/routing';

// Bangla is the default and has no prefix (/exams); English lives under /en (/en/exams).
// Bangla first (NFR-UX-01): no Accept-Language redirect; users switch with the language button.
export const routing = defineRouting({
  locales: ['bn', 'en'],
  defaultLocale: 'bn',
  localePrefix: 'as-needed',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
