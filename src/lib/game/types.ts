/**
 * Normalised domain model.
 *
 * Everything above the upstream layer speaks these types, never the raw API shapes.
 * That boundary is what lets the API drift without the whole application drifting
 * with it, and it is where "we don't know this value" becomes an explicit `null`
 * rather than a silently-wrong zero.
 */

export interface Resource {
  /** The game's own resource identifier (`db_letter`). Stable across realms. */
  readonly id: number;
  readonly name: string;
  /** URL-safe identifier used in our own routes, e.g. "grapes". */
  readonly slug: string;
  /** Path fragment of the official artwork, when the encyclopedia provides one. */
  readonly image: string | null;
  /** Transport units consumed per unit moved. `null` when unknown. */
  readonly transportUnits: number | null;
  /** Base units produced per hour per building level, before any modifier. */
  readonly baseUnitsPerHour: number | null;
  readonly retailable: boolean | null;
  /** Research goods are abstract and are not physically transported. */
  readonly isResearch: boolean | null;
  readonly category: string | null;
}

export interface RecipeInput {
  readonly resourceId: number;
  readonly resourceName: string | null;
  /** Units of input consumed per unit of output. */
  readonly amount: number;
}

export interface Recipe {
  readonly outputResourceId: number;
  readonly inputs: readonly RecipeInput[];
  /** Building kinds able to produce this resource. */
  readonly producedIn: readonly string[];
}

export interface BuildingProductionLine {
  readonly resourceId: number | null;
  readonly resourceName: string | null;
  /** Units produced per hour at level 1 with no modifiers. */
  readonly unitsPerHour: number | null;
}

export interface Building {
  readonly kind: string;
  readonly name: string;
  readonly slug: string;
  readonly image: string | null;
  readonly category: string | null;
  /** Construction cost. Unit is given by `costUnit` — often money, sometimes materials. */
  readonly cost: number | null;
  readonly costUnit: string | null;
  /** Hourly wage bill per building level. */
  readonly wagesPerHourPerLevel: number | null;
  readonly secondsToBuild: number | null;
  readonly robotsNeeded: number | null;
  readonly production: readonly BuildingProductionLine[];
  readonly isRetail: boolean;
}

/** One Exchange offer as listed by a seller. */
export interface MarketOffer {
  readonly resourceId: number;
  readonly quality: number;
  readonly price: number;
  readonly quantity: number;
  readonly sellerName: string | null;
}

/**
 * Aggregated view of one resource's order book at one moment.
 *
 * Every field is derived from offers actually present upstream. A field is `null`
 * when the market genuinely has nothing to say (an empty book), never 0-as-unknown.
 */
export interface MarketQuote {
  readonly resourceId: number;
  readonly realmId: number;
  /** Cheapest asking price across all qualities. */
  readonly lowestPrice: number | null;
  /** Cheapest asking price at each quality level present in the book. */
  readonly pricesByQuality: Readonly<Record<number, number>>;
  /** Total units offered across all qualities. */
  readonly totalQuantity: number;
  readonly offerCount: number;
  /** Quantity-weighted mean asking price. */
  readonly weightedAveragePrice: number | null;
  readonly medianPrice: number | null;
  readonly highestPrice: number | null;
  /** Distinct qualities present in the book. */
  readonly qualitiesAvailable: readonly number[];
  readonly observedAt: string;
}

export type DataProvenance =
  /** Read from the game's API within the current freshness window. */
  | 'live'
  /** Read from the game's API, but older than the freshness window. */
  | 'stale'
  /** Computed by Ledgerforge from live or historical values. */
  | 'derived'
  /** Recorded by Ledgerforge's own snapshot pipeline over time. */
  | 'collected'
  /** Supplied by the user. */
  | 'user'
  /** Fixture data. Only ever used in development and tests. */
  | 'fixture';

/** Wrapper attaching provenance and age to any value shown to a player. */
export interface Sourced<T> {
  readonly value: T;
  readonly provenance: DataProvenance;
  /** ISO timestamp of when the underlying data was observed. */
  readonly observedAt: string | null;
  /** Seconds since observation, at render time. */
  readonly ageSeconds: number | null;
}

export function sourced<T>(value: T, provenance: DataProvenance, observedAt: string | null): Sourced<T> {
  return {
    value,
    provenance,
    observedAt,
    ageSeconds: observedAt ? Math.max(0, Math.round((Date.now() - Date.parse(observedAt)) / 1000)) : null,
  };
}
