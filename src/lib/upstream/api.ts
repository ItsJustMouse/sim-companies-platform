import { httpClient } from './client';
import {
  rawBuildingListSchema,
  rawMarketResponseSchema,
  rawResourceDetailSchema,
  rawResourceListSchema,
  rawCompanySchema,
} from './schemas';
import { normaliseBuildings, normaliseCompany, normaliseOffers, normaliseRecipe, normaliseResources } from './normalise';
import type { Building, MarketOffer, Recipe, Resource } from '@/lib/game/types';
import type { PublicCompany } from './normalise';

/**
 * Typed accessors for the Sim Companies endpoints Ledgerforge depends on.
 *
 * Paths were reconstructed from community documentation; none of them are covered by
 * an official contract. Each accessor therefore states what it is for, and
 * docs/SIMCOMPANIES_API_RESEARCH.md records the confidence in the path itself.
 *
 * Every method is a read. This client has no write path by construction.
 */

/** Encyclopedia index of every resource in the game. Language-independent data. */
export async function fetchResources(realmId: number, lang = 'en'): Promise<Resource[]> {
  const raw = await httpClient().get(
    `/api/v4/${lang}/${realmId}/encyclopedia/resources/`,
    rawResourceListSchema,
    { timeoutMs: 30_000 },
  );
  return normaliseResources(raw);
}

/**
 * Detail for one resource at one quality, including its recipe.
 * Quality affects the *values* returned, not the recipe structure.
 */
export async function fetchResourceDetail(
  realmId: number,
  resourceId: number,
  quality = 0,
  lang = 'en',
): Promise<Recipe | null> {
  const raw = await httpClient().get(
    `/api/v4/${lang}/${realmId}/encyclopedia/resources/${resourceId}/${quality}/`,
    rawResourceDetailSchema,
  );
  return normaliseRecipe(raw);
}

/** Every building type, with wages, construction cost and production lines. */
export async function fetchBuildings(realmId: number): Promise<Building[]> {
  const raw = await httpClient().get(`/api/v3/${realmId}/buildings/1/`, rawBuildingListSchema, {
    timeoutMs: 30_000,
  });
  return normaliseBuildings(raw);
}

/**
 * The live Exchange order book for one resource: every open sell offer, per quality.
 *
 * This is the single highest-value endpoint in the product and the one we call most
 * often, so it is also the one the ingestion scheduler paces most carefully.
 */
export async function fetchMarketOffers(realmId: number, resourceId: number): Promise<MarketOffer[]> {
  const raw = await httpClient().get(`/api/v3/market/${realmId}/${resourceId}/`, rawMarketResponseSchema);
  return normaliseOffers(raw, resourceId);
}

/** Public profile of a company, addressed by its display name. */
export async function fetchPublicCompany(realmId: number, companyName: string): Promise<PublicCompany> {
  const raw = await httpClient().get(
    `/api/v2/companies-by-company/${realmId}/${encodeURIComponent(companyName)}/`,
    rawCompanySchema,
  );
  return normaliseCompany(raw);
}

export function upstreamHealth() {
  return httpClient().health();
}
