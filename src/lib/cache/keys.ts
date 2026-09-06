/**
 * Centralised cache keys.
 *
 * Keys are versioned (`v1:`) so a change in the cached value's shape can be rolled
 * out by bumping the prefix instead of flushing a shared Redis by hand.
 */
const V = 'lf:v1';

export const cacheKeys = {
  resources: (realmId: number) => `${V}:catalog:resources:${realmId}`,
  buildings: (realmId: number) => `${V}:catalog:buildings:${realmId}`,
  recipe: (realmId: number, resourceId: number) => `${V}:catalog:recipe:${realmId}:${resourceId}`,
  marketOffers: (realmId: number, resourceId: number) => `${V}:market:offers:${realmId}:${resourceId}`,
  marketOverview: (realmId: number) => `${V}:market:overview:${realmId}`,
  publicCompany: (realmId: number, name: string) => `${V}:company:${realmId}:${name.toLowerCase()}`,
} as const;

/**
 * Freshness policy per data class.
 *
 * The Sim Companies API guide asks third-party tools not to poll aggressively. These
 * windows are the concrete expression of that: catalog data changes only when the
 * game ships an update, so it is cached for hours; order books move continuously but
 * a few minutes of age costs a player nothing and costs the game's servers a great
 * deal less.
 */
export const cachePolicy = {
  /** Encyclopedia data: resources, buildings, recipes. */
  catalog: { freshSeconds: 6 * 60 * 60, staleSeconds: 24 * 60 * 60 },
  /** Exchange order books. */
  market: { freshSeconds: 5 * 60, staleSeconds: 60 * 60 },
  /** Derived market-wide aggregates. */
  overview: { freshSeconds: 5 * 60, staleSeconds: 60 * 60 },
  /** Public company profiles. */
  company: { freshSeconds: 10 * 60, staleSeconds: 6 * 60 * 60 },
} as const;
