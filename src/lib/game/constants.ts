/**
 * Game mechanics constants and their provenance.
 *
 * Simconomist is an independent third-party tool. The Sim Companies API is
 * undocumented and the game's formulas are not published by the operators, so every
 * constant here carries an explicit confidence level and source. The UI surfaces this
 * metadata wherever a number derived from it is displayed — a player must always be
 * able to see *why* we believe a figure is correct.
 *
 * Rules for this file:
 *   - Never add a constant without a source and a confidence level.
 *   - Prefer values fetched live from the game's own encyclopedia endpoints
 *     (building wages, production rates, recipes) over anything hard-coded here.
 *     Constants belong here only when the game does not expose them at all.
 *   - When a value is disputed, record the dispute rather than silently picking one.
 */

export type Confidence =
  /** Stated by the game operators or directly observable in official API output. */
  | 'official'
  /** Consistent across multiple independent community sources and internally coherent. */
  | 'community-consensus'
  /** Reported by a single source, or plausible but unconfirmed. */
  | 'unconfirmed';

export interface GameConstant<T> {
  readonly value: T;
  readonly confidence: Confidence;
  /** Human-readable provenance shown in "how was this calculated" panels. */
  readonly source: string;
  /** Anything a player should know before trusting a number derived from this. */
  readonly caveat?: string;
}

function constant<T>(value: T, confidence: Confidence, source: string, caveat?: string): GameConstant<T> {
  return caveat === undefined ? { value, confidence, source } : { value, confidence, source, caveat };
}

/**
 * Fee the Exchange charges the seller, as a fraction of gross sale value.
 * Applied to sales made *on the Exchange*; direct contracts between companies are
 * widely reported to carry no such fee.
 */
export const EXCHANGE_SELLER_FEE = constant(
  0.03,
  'community-consensus',
  'Community guides and multiple open-source Sim Companies calculators independently apply a 3% seller-side Exchange fee (price * 0.97).',
  'Verify against a real sale before relying on this for large decisions. Contract sales are modelled with no fee.',
);

/**
 * Wage reduction applied when a building is staffed with robots rather than workers.
 * Modelled as a multiplier on the building's hourly wage bill.
 */
export const ROBOT_WAGE_MULTIPLIER = constant(
  0.97,
  'unconfirmed',
  'Several open-source community calculators multiply wages by 0.97 when robots are enabled.',
  'Single-mechanism, low-confidence. Treated as an optional, clearly-labelled toggle and defaults to OFF.',
);

/**
 * Share of transportation cost borne by the seller when goods move via a contract
 * rather than an Exchange sale.
 */
export const CONTRACT_TRANSPORT_SHARE = constant(
  0.5,
  'unconfirmed',
  'Community calculators halve transport cost on contract sales, implying the counterparty covers the other half.',
  'Depends on how a contract is negotiated in-game. Exposed as an adjustable input rather than a fixed rule.',
);

/**
 * Quality levels the Exchange exposes. Offers are listed per quality and a buyer
 * looking for "at least Q" may be filled by any offer of that quality or better.
 */
export const QUALITY_MIN = constant(0, 'official', 'Exchange listings observed with quality starting at 0.');
export const QUALITY_MAX_TYPICAL = constant(
  12,
  'community-consensus',
  'Community tooling treats quality as a small non-negative integer; 12 is the highest routinely observed for tradable goods.',
  'Not a hard game cap. The application derives the real maximum from live listings and only uses this as a UI default.',
);

/**
 * Realms are separate game economies with independent markets and prices.
 * Realm identifiers appear as a path segment in most API routes.
 */
export const REALMS = [
  { id: 0, slug: 'magnates', name: 'Magnates' },
  { id: 1, slug: 'entrepreneurs', name: 'Entrepreneurs' },
] as const;

export type RealmId = (typeof REALMS)[number]['id'];
export type RealmSlug = (typeof REALMS)[number]['slug'];

export const DEFAULT_REALM_ID: RealmId = 0;

export function realmBySlug(slug: string): (typeof REALMS)[number] | undefined {
  return REALMS.find((r) => r.slug === slug);
}

export function realmById(id: number): (typeof REALMS)[number] | undefined {
  return REALMS.find((r) => r.id === id);
}

/**
 * Every constant above, for the "data & assumptions" page and for embedding
 * provenance into calculation results.
 */
export const GAME_CONSTANTS = {
  EXCHANGE_SELLER_FEE,
  ROBOT_WAGE_MULTIPLIER,
  CONTRACT_TRANSPORT_SHARE,
  QUALITY_MIN,
  QUALITY_MAX_TYPICAL,
} as const;

export type GameConstantKey = keyof typeof GAME_CONSTANTS;
