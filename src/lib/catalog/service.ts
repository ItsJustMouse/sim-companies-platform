import { cache as requestCache } from 'react';
import { cachePolicy, cacheKeys } from '@/lib/cache/keys';
import { swrTolerant } from '@/lib/cache/swr';
import { fetchBuildings, fetchResourceDetail, fetchResources } from '@/lib/upstream/api';
import { log } from '@/lib/util/logger';
import { safeRead } from '@/lib/db/client';
import type { Building, Recipe, Resource } from '@/lib/game/types';
import * as repo from './repository';

/**
 * Catalog reads, with a three-tier fallback: cache → upstream → database.
 *
 * The database tier is what makes the site survive an upstream outage. Catalog data
 * only changes when the game ships an update, so serving yesterday's copy of the
 * recipe for grapes is not a compromise — it is the same data.
 */

export interface CatalogResult<T> {
  readonly data: T;
  readonly source: 'upstream' | 'database';
  readonly observedAt: string | null;
  /** True when we fell back to stored data because upstream was unavailable. */
  readonly degraded: boolean;
}

/**
 * Reads below are wrapped in React's `cache()`, which memoises per request.
 *
 * A single page can ask for the resource catalog from four different components;
 * without this, each one repeats the cache lookup and the database fallback. The
 * cross-request cache is a separate concern handled by `swr` — this only removes
 * duplicate work inside one render.
 */
export const getResources = requestCache(async function getResources(
  realmId: number,
): Promise<CatalogResult<Resource[]>> {
  const cached = await swrTolerant(cacheKeys.resources(realmId), cachePolicy.catalog, async () => {
    const fresh = await fetchResources(realmId);
    // Persist on every successful fetch so the database tier stays warm.
    await repo.upsertResources(realmId, fresh).catch((error: unknown) => {
      log.warn('failed to persist resources', { realmId, error });
    });
    return fresh;
  });

  if (cached && cached.value.length > 0) {
    return {
      data: cached.value,
      source: 'upstream',
      observedAt: cached.storedAt,
      degraded: cached.degraded || cached.freshness === 'stale',
    };
  }

  const stored = await safeRead(() => repo.listResources(realmId), [], 'listResources');
  return { data: stored, source: 'database', observedAt: null, degraded: true };
});

export const getBuildings = requestCache(async function getBuildings(
  realmId: number,
): Promise<CatalogResult<Building[]>> {
  const cached = await swrTolerant(cacheKeys.buildings(realmId), cachePolicy.catalog, async () => {
    const fresh = await fetchBuildings(realmId);
    await repo.upsertBuildings(realmId, fresh).catch((error: unknown) => {
      log.warn('failed to persist buildings', { realmId, error });
    });
    return fresh;
  });

  if (cached && cached.value.length > 0) {
    return {
      data: cached.value,
      source: 'upstream',
      observedAt: cached.storedAt,
      degraded: cached.degraded || cached.freshness === 'stale',
    };
  }

  const stored = await safeRead(() => repo.listBuildings(realmId), [], 'listBuildings');
  return { data: stored, source: 'database', observedAt: null, degraded: true };
});

export async function getRecipe(realmId: number, resourceId: number): Promise<Recipe | null> {
  const cached = await swrTolerant(cacheKeys.recipe(realmId, resourceId), cachePolicy.catalog, async () => {
    const fresh = await fetchResourceDetail(realmId, resourceId);
    if (fresh) {
      await repo.upsertRecipe(realmId, fresh).catch((error: unknown) => {
        log.warn('failed to persist recipe', { realmId, resourceId, error });
      });
    }
    return fresh;
  });

  if (cached?.value) return cached.value;
  return safeRead(() => repo.getRecipe(realmId, resourceId), null, 'getRecipe');
}

export async function findResource(realmId: number, slug: string): Promise<Resource | null> {
  // Slug lookups hit the database directly: it is a single indexed row, and going
  // through the full resource list would be a much larger read for one product page.
  const stored = await safeRead(() => repo.findResourceBySlug(realmId, slug), null, 'findResourceBySlug');
  if (stored) return stored;

  // Cold database (first boot before the first catalog sync): fall back to upstream.
  const { data } = await getResources(realmId);
  return data.find((r) => r.slug === slug) ?? null;
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
