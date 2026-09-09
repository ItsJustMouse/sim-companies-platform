import { cache as requestCache } from 'react';
import { safeRead } from '@/lib/db/client';
import type { Building, Recipe, Resource } from '@/lib/game/types';
import * as repo from './repository';

/**
 * Database-backed catalog reads for public pages.
 *
 * Browser-facing requests never contact Sim Companies. Background ingestion owns
 * upstream synchronization and persists verified catalog data here. This keeps normal
 * page rendering fast and prevents visitors from consuming upstream request slots.
 */

export interface CatalogResult<T> {
  readonly data: T;
  readonly source: 'upstream' | 'database';
  readonly observedAt: string | null;
  /** True when the requested catalog data is unavailable from local storage. */
  readonly degraded: boolean;
}

/**
 * Reads below are wrapped in React's `cache()`, which memoises per request.
 *
 * A single page can ask for the resource catalog from multiple components;
 * without this, each one would repeat the same database read. This only removes
 * duplicate work inside one render; persistent market and catalog data lives in
 * PostgreSQL and is refreshed by background ingestion.
 */
export const getResources = requestCache(async function getResources(
  realmId: number,
): Promise<CatalogResult<Resource[]>> {
  const stored = await safeRead(() => repo.listResources(realmId), [], 'listResources');

  return {
    data: stored,
    source: 'database',
    observedAt: null,
    degraded: stored.length === 0,
  };
});

export const getBuildings = requestCache(async function getBuildings(
  realmId: number,
): Promise<CatalogResult<Building[]>> {
  const stored = await safeRead(() => repo.listBuildings(realmId), [], 'listBuildings');

  return {
    data: stored,
    source: 'database',
    observedAt: null,
    degraded: stored.length === 0,
  };
});

export async function getRecipe(realmId: number, resourceId: number): Promise<Recipe | null> {
  return safeRead(() => repo.getRecipe(realmId, resourceId), null, 'getRecipe');
}

export async function findResource(realmId: number, slug: string): Promise<Resource | null> {
  // Slug lookups hit the database directly: it is a single indexed row, and going
  // through the full resource list would be a much larger read for one product page.
  const stored = await safeRead(() => repo.findResourceBySlug(realmId, slug), null, 'findResourceBySlug');
  if (stored) return stored;

  // A missing local row stays missing until background ingestion discovers it.
  // Public page requests must never consume an upstream request slot.
  return null;
}

export async function getResourceIndex(realmId: number): Promise<Map<number, Resource>> {
  const { data } = await getResources(realmId);
  return new Map(data.map((r) => [r.id, r]));
}

/**
 * Which resources each resource is an input to.
 * Powers "what is this used for" on product pages and the production-chain view.
 */
export async function buildConsumerIndex(realmId: number): Promise<Map<number, number[]>> {
  const all = await safeRead(() => repo.listRecipes(realmId), [], 'listRecipes');
  const index = new Map<number, number[]>();
  for (const recipe of all) {
    for (const input of recipe.inputs) {
      const list = index.get(input.resourceId) ?? [];
      list.push(recipe.outputResourceId);
      index.set(input.resourceId, list);
    }
  }
  return index;
}

export { repo as catalogRepository };
