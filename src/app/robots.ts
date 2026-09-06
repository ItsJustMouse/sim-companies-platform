import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

/**
 * robots.txt
 *
 * Account, admin and API paths are excluded because they hold nothing a search
 * engine should index and would waste crawl budget. Everything of value to a reader
 * is public and crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/account/', '/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
    host: siteUrl('/').replace(/\/$/, ''),
  };
}
