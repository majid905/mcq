import type { MetadataRoute } from 'next';

const SITE = process.env.SITE_URL ?? 'https://mcq.ellevix.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed-in app, BFF and dev tools are not for search engines.
      disallow: [
        '/api/',
        '/home',
        '/exams',
        '/room',
        '/results',
        '/practice',
        '/profile',
        '/settings',
        '/dev/',
        '/en/home',
        '/en/room',
        '/en/dev/',
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
