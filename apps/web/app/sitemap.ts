import type { MetadataRoute } from 'next';

// Public, indexable pages in both languages. Question and paper URLs join once the API can
// list them (contract-change request: public question/paper listing for the sitemap).
const SITE = process.env.SITE_URL ?? 'https://mcq.ellevix.com';
const PUBLIC_PATHS = ['/', '/plans', '/about', '/contact', '/privacy', '/terms', '/refund'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE}${path === '/' ? '' : path}`,
    changeFrequency: path === '/' ? 'daily' : 'monthly',
    priority: path === '/' ? 1 : 0.5,
    alternates: {
      languages: {
        bn: `${SITE}${path === '/' ? '' : path}`,
        en: `${SITE}/en${path === '/' ? '' : path}`,
      },
    },
  }));
}
