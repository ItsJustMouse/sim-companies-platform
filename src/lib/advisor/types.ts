/**
 * Company state the advisor reasons over.
 *
 * Deliberately a plain, hand-fillable shape rather than a mirror of any API
 * response. The game exposes no third-party authorisation mechanism, so there is no
 * legitimate way for a server to read a player's private company data — we will not
 * ask for a password or a session cookie to work around that (docs/SECURITY.md).
 *
 * So company state reaches the advisor by one of three routes:
 *   1. the game's *public* company endpoint, for the handful of public figures;
 *   2. the player entering their buildings by hand;
 *   3. the player pasting their own data, which stays in their browser.
 *
 * All three produce this structure, and the advisor never knows which it came from
 * beyond the `source` field it reports back to the reader.
 */

export type CompanyDataSource = 'public-profile' | 'manual' | 'local-import';

export interface CompanyBuilding {
  /** Free-text label the player recognises. */
  readonly label: string;
  /** Building kind from the catalog, when known. */
  readonly kind: string | null;
  readonly level: number;
  /** Resource this building is currently producing, if any. */
  readonly producingResourceId: number | null;
  /** True when the building is not currently producing anything. */
  readonly idle: boolean;
}

export interface CompanyInventoryLine {
  readonly resourceId: number;
  readonly quantity: number;
}

export interface CompanyState {
  readonly name: string;
  readonly realmId: number;
  readonly source: CompanyDataSource;
  readonly cash: number | null;
  readonly level: number | null;
  /** The game's own company value, when the public profile provides it. */
  readonly reportedValue: number | null;
  readonly adminOverhead: number;
  readonly buildings: readonly CompanyBuilding[];
  readonly inventory: readonly CompanyInventoryLine[];
  readonly capturedAt: string;
}

export type RecommendationSeverity = 'critical' | 'opportunity' | 'informational';

export interface Recommendation {
  readonly id: string;
  readonly severity: RecommendationSeverity;
  readonly title: string;
  /** One sentence a player can act on without reading further. */
  readonly summary: string;
  /** The numbers behind it. Never a bare assertion. */
  readonly evidence: readonly { readonly label: string; readonly value: string }[];
  /** What we assumed to reach this conclusion. */
  readonly assumptions: readonly string[];
  /** Estimated financial impact per hour, when quantifiable. */
  readonly impactPerHour: number | null;
  readonly href?: string;
  readonly hrefLabel?: string;
}
