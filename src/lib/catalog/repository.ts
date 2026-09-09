import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { buildings, recipes, resources } from '@/lib/db/schema';
import type { Building, BuildingProductionLine, Recipe, RecipeInput, Resource } from '@/lib/game/types';

/**
 * Persistence for the game catalog.
 *
 * The catalog is a mirror of the game's own encyclopedia. Keeping a copy means the
 * site still renders product pages, recipes and calculators when the upstream is
 * unreachable — catalog data changes only when the game ships an update, so a copy
 * that is hours old is as good as live.
 */

export async function upsertResources(realmId: number, items: readonly Resource[]): Promise<number> {
  if (items.length === 0) return 0;
  const now = new Date();

  await db()
    .insert(resources)
    .values(
      items.map((r) => ({
        realmId,
        resourceId: r.id,
        name: r.name,
        slug: r.slug,
        image: r.image,
        transportUnits: r.transportUnits,
        baseUnitsPerHour: r.baseUnitsPerHour,
        retailable: r.retailable,
        isResearch: r.isResearch,
        category: r.category,
        syncedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [resources.realmId, resources.resourceId],
      set: {
        name: sqlExcluded('name'),
        slug: sqlExcluded('slug'),
        image: sqlExcluded('image'),
        transportUnits: sqlExcluded('transport_units'),
        baseUnitsPerHour: sqlExcluded('base_units_per_hour'),
        retailable: sqlExcluded('retailable'),
        isResearch: sqlExcluded('is_research'),
        category: sqlExcluded('category'),
        syncedAt: sqlExcluded('synced_at'),
      },
    });

  return items.length;
}

/**
 * Ensures every resource visible in the whole-market ticker has a catalog row.
 *
 * The ticker only exposes ID, image path and headline price. On first insert we
 * create a deliberately partial Resource record. On conflict we update only the
 * image/sync time so a future richer encyclopedia sync is never downgraded back to
 * ticker-derived metadata.
 */
export async function ensureTickerResources(
  realmId: number,
  items: readonly Resource[],
): Promise<number> {
  if (items.length === 0) return 0;

  const now = new Date();

  await db()
    .insert(resources)
    .values(
      items.map((r) => ({
        realmId,
        resourceId: r.id,
        name: r.name,
        slug: r.slug,
        image: r.image,
        transportUnits: null,
        baseUnitsPerHour: null,
        retailable: null,
        isResearch: null,
        category: null,
        syncedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [resources.realmId, resources.resourceId],
      set: {
        image: sqlExcluded('image'),
        syncedAt: sqlExcluded('synced_at'),
      },
    });

  return items.length;
}

export async function upsertBuildings(realmId: number, items: readonly Building[]): Promise<number> {
  if (items.length === 0) return 0;
  const now = new Date();

  await db()
    .insert(buildings)
    .values(
      items.map((b) => ({
        realmId,
        kind: b.kind,
        name: b.name,
        slug: b.slug,
        image: b.image,
        category: b.category,
        cost: b.cost,
        costUnit: b.costUnit,
        wagesPerHourPerLevel: b.wagesPerHourPerLevel,
        secondsToBuild: b.secondsToBuild,
        robotsNeeded: b.robotsNeeded,
        isRetail: b.isRetail,
        production: b.production,
        syncedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [buildings.realmId, buildings.kind],
      set: {
        name: sqlExcluded('name'),
        slug: sqlExcluded('slug'),
        image: sqlExcluded('image'),
        category: sqlExcluded('category'),
        cost: sqlExcluded('cost'),
        costUnit: sqlExcluded('cost_unit'),
        wagesPerHourPerLevel: sqlExcluded('wages_per_hour_per_level'),
        secondsToBuild: sqlExcluded('seconds_to_build'),
        robotsNeeded: sqlExcluded('robots_needed'),
        isRetail: sqlExcluded('is_retail'),
        production: sqlExcluded('production'),
        syncedAt: sqlExcluded('synced_at'),
      },
    });

  return items.length;
}

export async function upsertRecipe(realmId: number, recipe: Recipe): Promise<void> {
  await db()
    .insert(recipes)
    .values({
      realmId,
      outputResourceId: recipe.outputResourceId,
      inputs: recipe.inputs,
      producedIn: recipe.producedIn,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [recipes.realmId, recipes.outputResourceId],
      set: {
        inputs: sqlExcluded('inputs'),
        producedIn: sqlExcluded('produced_in'),
        syncedAt: sqlExcluded('synced_at'),
      },
    });
}

export async function listResources(realmId: number): Promise<Resource[]> {
  const rows = await db().select().from(resources).where(eq(resources.realmId, realmId));
  return rows
    .map(
      (row): Resource => ({
        id: row.resourceId,
        name: row.name,
        slug: row.slug,
        image: row.image,
        transportUnits: row.transportUnits,
        baseUnitsPerHour: row.baseUnitsPerHour,
        retailable: row.retailable,
        isResearch: row.isResearch,
        category: row.category,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findResourceBySlug(realmId: number, slug: string): Promise<Resource | null> {
  const [row] = await db()
    .select()
    .from(resources)
    .where(and(eq(resources.realmId, realmId), eq(resources.slug, slug)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.resourceId,
    name: row.name,
    slug: row.slug,
    image: row.image,
    transportUnits: row.transportUnits,
    baseUnitsPerHour: row.baseUnitsPerHour,
    retailable: row.retailable,
    isResearch: row.isResearch,
    category: row.category,
  };
}

export async function listBuildings(realmId: number): Promise<Building[]> {
  const rows = await db().select().from(buildings).where(eq(buildings.realmId, realmId));
  return rows
    .map(
      (row): Building => ({
        kind: row.kind,
        name: row.name,
        slug: row.slug,
        image: row.image,
        category: row.category,
        cost: row.cost,
        costUnit: row.costUnit,
        wagesPerHourPerLevel: row.wagesPerHourPerLevel,
        secondsToBuild: row.secondsToBuild,
        robotsNeeded: row.robotsNeeded,
        production: (row.production as BuildingProductionLine[] | null) ?? [],
        isRetail: row.isRetail,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRecipe(realmId: number, resourceId: number): Promise<Recipe | null> {
  const [row] = await db()
    .select()
    .from(recipes)
    .where(and(eq(recipes.realmId, realmId), eq(recipes.outputResourceId, resourceId)))
    .limit(1);
  if (!row) return null;
  return {
    outputResourceId: row.outputResourceId,
    inputs: (row.inputs as RecipeInput[] | null) ?? [],
    producedIn: (row.producedIn as string[] | null) ?? [],
  };
}

export async function listRecipes(realmId: number): Promise<Recipe[]> {
  const rows = await db().select().from(recipes).where(eq(recipes.realmId, realmId));
  return rows.map((row) => ({
    outputResourceId: row.outputResourceId,
    inputs: (row.inputs as RecipeInput[] | null) ?? [],
    producedIn: (row.producedIn as string[] | null) ?? [],
  }));
}

/**
 * `excluded."<column>"` reference for upsert conflict clauses.
 *
 * Column names passed here are compile-time literals from this module — never user
 * input — so raw interpolation is safe and keeps the clauses above readable.
 */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
