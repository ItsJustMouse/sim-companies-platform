import type { Metadata } from 'next';
import { env } from '@/lib/env';

/**
 * SEO helpers.
 *
 * The product's search strategy is straightforward: every indexable page must answer
 * a real question a player has. There are no pages generated purely to hold keywords,
 * and nothing is indexed that a person would be disappointed to land on.
 */

export const SITE = {
  name: 'Simconomist',
  tagline: 'Market intelligence for Sim Companies.',
  description:
    'Independent Sim Companies market observations, price history, market analytics and transparent planning calculators.',
} as const;

export function siteUrl(path = '/'): string {
  const base = env().APP_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildMetadata(args: {
  title: string;
  description: string;
  path: string;
  /** Set false for pages with no standalone search value (tool state, previews). */
  index?: boolean;
  type?: 'website' | 'article';
}): Metadata {
  const url = siteUrl(args.path);
  return {
    title: args.title,
    description: args.description,
    alternates: { canonical: url },
    robots: args.index === false ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${args.title} · ${SITE.name}`,
      description: args.description,
      url,
      siteName: SITE.name,
      type: args.type ?? 'website',
    },
    twitter: {
      card: 'summary',
      title: `${args.title} · ${SITE.name}`,
      description: args.description,
    },
  };
}

/** JSON-LD breadcrumbs. Rendered as a script tag by `<JsonLd>`. */
export function breadcrumbs(trail: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: siteUrl(crumb.path),
    })),
  };
}

export function organisation() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: siteUrl('/'),
    description: SITE.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl('/search')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}
