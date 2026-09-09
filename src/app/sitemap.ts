import type { MetadataRoute } from 'next';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { getResources } from '@/lib/catalog/service';
import { BETA_CALCULATORS } from '@/lib/calculators/catalog';
import { GUIDES } from '@/lib/content/guides';
import { siteUrl } from '@/lib/seo';

export const revalidate = 3600;

/**
 * XML sitemap.
 *
 * Change frequencies reflect what actually changes: product pages carry live prices
 * and are worth recrawling often, guides are stable. Nothing is listed that a reader
 * would be disappointed to land on — there are no pages generated purely to be
 * indexed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl('/'), lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: siteUrl('/exchange'), lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: siteUrl('/market'), lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: siteUrl('/market/movers'), lastModified: now, changeFrequency: 'hourly', priority: 0.7 },
    { url: siteUrl('/calculators'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: siteUrl('/learn'), lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: siteUrl('/methodology'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: siteUrl('/status'), lastModified: now, changeFrequency: 'daily', priority: 0.4 },
    { url: siteUrl('/about'), lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: siteUrl('/privacy'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: siteUrl('/terms'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  const calculatorRoutes: MetadataRoute.Sitemap = BETA_CALCULATORS.map((entry) => ({
    url: siteUrl(`/calculators/${entry.slug}`),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map((guide) => ({
    url: siteUrl(`/learn/${guide.slug}`),
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Catalog reads degrade to empty rather than failing, so a database outage
  // produces a smaller sitemap instead of a broken one.
  const { data: resources } = await getResources(DEFAULT_REALM_ID).catch(() => ({
    data: [] as Awaited<ReturnType<typeof getResources>>['data'],
  }));

  const productRoutes: MetadataRoute.Sitemap = resources.map((resource) => ({
    url: siteUrl(`/exchange/${resource.slug}`),
    lastModified: now,
    changeFrequency: 'hourly',
    priority: 0.8,
  }));



  return [...staticRoutes, ...calculatorRoutes, ...guideRoutes, ...productRoutes];
}
