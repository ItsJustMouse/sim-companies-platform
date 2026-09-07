import type { Building, BuildingProductionLine, MarketOffer, Recipe, RecipeInput, Resource } from '@/lib/game/types';
import { slugify } from '@/lib/util/slug';
import type {
  RawBuilding,
  RawCompany,
  RawMarketOffer,
  RawMarketTickerEntry,
  RawResource,
  RawResourceDetail,
} from './schemas';

/**
 * Raw upstream payloads → domain model.
 *
 * The API exposes the same concept under different key names depending on which
 * version of the endpoint you hit, so every read goes through `firstNumber` /
 * `firstString`, which take the first key that is actually present. Anything we
 * cannot determine becomes `null` — never a default that would later be mistaken
 * for a real measurement.
 */

type Unknowns = Record<string, unknown>;

function firstNumber(source: Unknowns, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function firstString(source: Unknowns, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

function firstBoolean(source: Unknowns, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

export function normaliseResource(raw: RawResource): Resource | null {
  const source = raw as unknown as Unknowns;
  const id = firstNumber(source, 'db_letter', 'id');
  // Without an id we cannot address the resource on any other endpoint, so the row
  // is unusable rather than merely incomplete.
  if (id === null) return null;

  return {
    id,
    name: raw.name,
    slug: slugify(raw.name),
    image: firstString(source, 'image'),
    transportUnits: firstNumber(source, 'transportation'),
    baseUnitsPerHour: firstNumber(source, 'anHour', 'producedAnHour'),
    retailable: firstBoolean(source, 'retailable'),
    isResearch: firstBoolean(source, 'research'),
    category: firstString(source, 'category', 'kind'),
  };
}

export function normaliseResources(raws: readonly RawResource[]): Resource[] {
  const seen = new Set<number>();
  const out: Resource[] = [];
  for (const raw of raws) {
    const resource = normaliseResource(raw);
    if (!resource || seen.has(resource.id)) continue;
    seen.add(resource.id);
    out.push(resource);
  }
  return out;
}

function normaliseRecipeInput(raw: unknown): RecipeInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Unknowns;

  // `resource` may be an id, or a nested object carrying the id.
  let resourceId = firstNumber(source, 'db_letter', 'id');
  let resourceName = firstString(source, 'name');

  const nested = source['resource'];
  if (typeof nested === 'number') {
    resourceId ??= nested;
  } else if (nested && typeof nested === 'object') {
    const nestedSource = nested as Unknowns;
    resourceId ??= firstNumber(nestedSource, 'db_letter', 'id');
    resourceName ??= firstString(nestedSource, 'name');
  }

  const amount = firstNumber(source, 'amount', 'quantity');
  if (resourceId === null || amount === null) return null;
  return { resourceId, resourceName, amount };
}

function normaliseProducedIn(value: unknown): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim() !== '') out.push(item);
    else if (item && typeof item === 'object') {
      const name = firstString(item as Unknowns, 'kind', 'name');
      if (name) out.push(name);
    }
  }
  return [...new Set(out)];
}

export function normaliseRecipe(raw: RawResourceDetail): Recipe | null {
  const source = raw as unknown as Unknowns;
  const outputResourceId = firstNumber(source, 'db_letter', 'id');
  if (outputResourceId === null) return null;

  const inputs = (raw.producedFrom ?? [])
    .map(normaliseRecipeInput)
    .filter((input): input is RecipeInput => input !== null);

  return {
    outputResourceId,
    inputs,
    producedIn: normaliseProducedIn(source['producedIn'] ?? source['producedAt']),
  };
}

function normaliseProductionLine(raw: unknown): BuildingProductionLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Unknowns;

  let resourceId = firstNumber(source, 'db_letter', 'id');
  let resourceName = firstString(source, 'name');
  let unitsPerHour = firstNumber(source, 'anHour');

  const nested = source['resource'];
  if (typeof nested === 'number') {
    resourceId ??= nested;
  } else if (nested && typeof nested === 'object') {
    const nestedSource = nested as Unknowns;
    resourceId ??= firstNumber(nestedSource, 'db_letter', 'id');
    resourceName ??= firstString(nestedSource, 'name');
    unitsPerHour ??= firstNumber(nestedSource, 'anHour');
  }

  if (resourceId === null && resourceName === null) return null;
  return { resourceId, resourceName, unitsPerHour };
}

export function normaliseBuilding(raw: RawBuilding): Building {
  const source = raw as unknown as Unknowns;
  const kind = firstString(source, 'kind') ?? slugify(raw.name);
  const retail = source['retail'];

  return {
    kind,
    name: raw.name,
    slug: slugify(raw.name),
    image: firstString(source, 'image'),
    category: firstString(source, 'category'),
    cost: firstNumber(source, 'cost'),
    costUnit: firstString(source, 'costUnits'),
    wagesPerHourPerLevel: firstNumber(source, 'wages'),
    secondsToBuild: firstNumber(source, 'secondsToBuild'),
    robotsNeeded: firstNumber(source, 'robotsNeeded'),
    production: (raw.production ?? [])
      .map(normaliseProductionLine)
      .filter((line): line is BuildingProductionLine => line !== null),
    isRetail: retail === true || (Array.isArray(retail) && retail.length > 0),
  };
}

export function normaliseBuildings(raws: readonly RawBuilding[]): Building[] {
  const seen = new Set<string>();
  const out: Building[] = [];
  for (const raw of raws) {
    const building = normaliseBuilding(raw);
    if (seen.has(building.kind)) continue;
    seen.add(building.kind);
    out.push(building);
  }
  return out;
}

export function normaliseOffers(raws: readonly RawMarketOffer[], resourceId: number): MarketOffer[] {
  const out: MarketOffer[] = [];
  for (const raw of raws) {
    const source = raw as unknown as Unknowns;
    const price = firstNumber(source, 'price');
    const quantity = firstNumber(source, 'quantity');
    const quality = firstNumber(source, 'quality');
    // A listing without a usable price or quantity tells us nothing about the market.
    if (price === null || quantity === null || quality === null) continue;
    if (price <= 0 || quantity <= 0 || quality < 0) continue;

    const seller = source['seller'];
    const sellerName =
      seller && typeof seller === 'object' ? firstString(seller as Unknowns, 'company', 'name') : null;

    out.push({
      resourceId: firstNumber(source, 'resource') ?? resourceId,
      quality: Math.round(quality),
      price,
      quantity,
      sellerName,
    });
  }
  return out;
}

/**
 * One resource from the whole-market ticker.
 *
 * This is intentionally smaller than MarketQuote because the ticker does not expose
 * order-book depth, quality, quantities, median price or seller information.
 */
export interface MarketTickerEntry {
  readonly resourceId: number;
  readonly realmId: number;
  readonly image: string | null;
  readonly price: number | null;
  readonly soldOut: boolean;
  readonly isUp: boolean | null;
}

export function normaliseMarketTicker(
  raws: readonly RawMarketTickerEntry[],
  fallbackRealmId: number,
): MarketTickerEntry[] {
  const seen = new Set<number>();
  const out: MarketTickerEntry[] = [];

  for (const raw of raws) {
    const source = raw as unknown as Unknowns;
    const resourceId = firstNumber(source, 'kind');

    if (resourceId === null || seen.has(resourceId)) continue;
    seen.add(resourceId);

    const rawPrice = source['price'];
    const soldOut =
      typeof rawPrice === 'string' &&
      rawPrice.trim().toLowerCase() === 'sold out';

    out.push({
      resourceId,
      realmId: firstNumber(source, 'realmId') ?? fallbackRealmId,
      image: firstString(source, 'image'),
      price: soldOut ? null : firstNumber(source, 'price'),
      soldOut,
      isUp: firstBoolean(source, 'is_up'),
    });
  }

  return out;
}

export interface PublicCompany {
  readonly id: string | null;
  readonly name: string | null;
  readonly level: number | null;
  readonly value: number | null;
  readonly logo: string | null;
}

export function normaliseCompany(raw: RawCompany): PublicCompany {
  const source = raw as unknown as Unknowns;
  const id = source['id'];
  return {
    id: typeof id === 'number' ? String(id) : typeof id === 'string' ? id : null,
    name: firstString(source, 'company', 'name'),
    level: firstNumber(source, 'level'),
    value: firstNumber(source, 'value'),
    logo: firstString(source, 'logo'),
  };
}

export const __testing = { firstNumber, firstString, firstBoolean, normaliseRecipeInput, normaliseProducedIn };
