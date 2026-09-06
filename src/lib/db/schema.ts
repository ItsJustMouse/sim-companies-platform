import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Ledgerforge database schema.
 *
 * Organised into five concerns that are deliberately kept separable, because they
 * have different retention rules, different privacy weight and different growth
 * curves (see docs/DATABASE.md):
 *
 *   1. Game catalog      — a cache of the game's own encyclopedia. Disposable.
 *   2. Market history    — our own observations. The one dataset we cannot re-fetch.
 *   3. Platform accounts — users, sessions. Deletable on request.
 *   4. User workspace    — watchlists, alerts, linked companies.
 *   5. Operations        — job bookkeeping and counters.
 */

// ---------------------------------------------------------------------------
// 1. Game catalog (refreshed from upstream; safe to truncate and rebuild)
// ---------------------------------------------------------------------------

export const resources = pgTable(
  'resources',
  {
    realmId: smallint('realm_id').notNull(),
    /** The game's own resource id (`db_letter`). */
    resourceId: integer('resource_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    image: text('image'),
    transportUnits: doublePrecision('transport_units'),
    baseUnitsPerHour: doublePrecision('base_units_per_hour'),
    retailable: boolean('retailable'),
    isResearch: boolean('is_research'),
    category: text('category'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.realmId, t.resourceId] }),
    // Product pages are addressed by slug; this is the hot lookup for every
    // /exchange/<slug> request and must be unique per realm to stay unambiguous.
    uniqueIndex('resources_realm_slug_idx').on(t.realmId, t.slug),
    index('resources_name_idx').on(t.name),
  ],
);

export const buildings = pgTable(
  'buildings',
  {
    realmId: smallint('realm_id').notNull(),
    kind: varchar('kind', { length: 120 }).notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    image: text('image'),
    category: text('category'),
    cost: doublePrecision('cost'),
    costUnit: text('cost_unit'),
    wagesPerHourPerLevel: doublePrecision('wages_per_hour_per_level'),
    secondsToBuild: integer('seconds_to_build'),
    robotsNeeded: doublePrecision('robots_needed'),
    isRetail: boolean('is_retail').notNull().default(false),
    /** Production lines, as normalised `BuildingProductionLine[]`. */
    production: jsonb('production').notNull().default(sql`'[]'::jsonb`),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.realmId, t.kind] }),
    uniqueIndex('buildings_realm_slug_idx').on(t.realmId, t.slug),
  ],
);

export const recipes = pgTable(
  'recipes',
  {
    realmId: smallint('realm_id').notNull(),
    outputResourceId: integer('output_resource_id').notNull(),
    /** Normalised `RecipeInput[]`. Stored as a document because it is always read whole. */
    inputs: jsonb('inputs').notNull().default(sql`'[]'::jsonb`),
    producedIn: jsonb('produced_in').notNull().default(sql`'[]'::jsonb`),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.realmId, t.outputResourceId] })],
);

// ---------------------------------------------------------------------------
// 2. Market history (collected by Ledgerforge; irreplaceable)
// ---------------------------------------------------------------------------

/**
 * One row per resource per sweep: the whole order book collapsed to a summary.
 *
 * Storing the summary rather than every individual offer keeps this table roughly
 * (resources x sweeps/day) rows — a few hundred thousand a month — while preserving
 * everything the product actually plots. Individual offers are not retained; they
 * are transient and would multiply the row count by two orders of magnitude for no
 * analytical gain.
 */
export const marketSnapshots = pgTable(
  'market_snapshots',
  {
    realmId: smallint('realm_id').notNull(),
    resourceId: integer('resource_id').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    lowestPrice: doublePrecision('lowest_price'),
    highestPrice: doublePrecision('highest_price'),
    medianPrice: doublePrecision('median_price'),
    weightedAveragePrice: doublePrecision('weighted_average_price'),
    totalQuantity: doublePrecision('total_quantity').notNull().default(0),
    offerCount: integer('offer_count').notNull().default(0),
    /** `{ "<quality>": price }` — cheapest offer satisfying each quality level. */
    pricesByQuality: jsonb('prices_by_quality').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    primaryKey({ columns: [t.realmId, t.resourceId, t.observedAt] }),
    // Chart queries are always "one resource over a time range", which the primary
    // key already serves. This index serves the cross-sectional "everything as of
    // time T" queries used by the market overview and the mover calculations.
    index('market_snapshots_observed_idx').on(t.observedAt),
  ],
);

/**
 * Downsampled OHLC candles.
 *
 * Snapshots are aggregated into 1h candles, and 1h candles into 1d candles, so a
 * 1-year chart reads ~365 rows instead of ~35,000. Retention differs per interval
 * (docs/MARKET_DATA.md): raw snapshots are pruned aggressively, daily candles are
 * kept indefinitely because they are cheap and cannot be reconstructed.
 */
export const marketCandles = pgTable(
  'market_candles',
  {
    realmId: smallint('realm_id').notNull(),
    resourceId: integer('resource_id').notNull(),
    /** Quality this series tracks. Quality 0 is the headline series. */
    quality: smallint('quality').notNull(),
    /** '1h' or '1d'. */
    interval: varchar('interval', { length: 4 }).notNull(),
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    open: doublePrecision('open').notNull(),
    high: doublePrecision('high').notNull(),
    low: doublePrecision('low').notNull(),
    close: doublePrecision('close').notNull(),
    /** Mean of the observations in the bucket. */
    average: doublePrecision('average').notNull(),
    /** Mean total units on offer during the bucket — a supply proxy, not traded volume. */
    averageQuantity: doublePrecision('average_quantity'),
    /** How many snapshots the bucket was built from; low counts mean low confidence. */
    sampleCount: integer('sample_count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.realmId, t.resourceId, t.quality, t.interval, t.bucketStart] }),
    index('market_candles_range_idx').on(t.interval, t.bucketStart),
  ],
);

// ---------------------------------------------------------------------------
// 3. Platform accounts
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    /** Stored lower-cased; the unique index is what prevents duplicate signups. */
    email: text('email').notNull(),
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** Preferences blob (theme, default realm, table columns). Non-sensitive. */
    preferences: jsonb('preferences').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

/**
 * Active sessions.
 *
 * Only a hash of the session token is stored, so a database leak does not hand an
 * attacker usable sessions.
 */
export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the opaque token held in the client's cookie. */
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Coarse client hint for the "your sessions" screen. Never a full user agent string. */
    clientHint: varchar('client_hint', { length: 80 }),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expiry_idx').on(t.expiresAt)],
);

/** Single-use magic-link tokens. Hashed, short-lived, consumed on first use. */
export const loginTokens = pgTable(
  'login_tokens',
  {
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('login_tokens_email_idx').on(t.email), index('login_tokens_expiry_idx').on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// 4. User workspace
// ---------------------------------------------------------------------------

export const watchlists = pgTable(
  'watchlists',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    realmId: smallint('realm_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('watchlists_user_idx').on(t.userId)],
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    watchlistId: varchar('watchlist_id', { length: 32 })
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    resourceId: integer('resource_id').notNull(),
    /** Optional price the user is waiting for; drives the "target reached" badge. */
    targetPrice: doublePrecision('target_price'),
    note: text('note'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.watchlistId, t.resourceId] })],
);

/**
 * Linked Sim Companies companies.
 *
 * Only *public* identifiers are stored. Ledgerforge does not hold game credentials:
 * the game exposes no third-party authorisation mechanism, so anything requiring a
 * player's own session stays in that player's browser (docs/SECURITY.md).
 */
export const linkedCompanies = pgTable(
  'linked_companies',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    realmId: smallint('realm_id').notNull(),
    /** Public company name, as it appears in-game. */
    companyName: text('company_name').notNull(),
    /** Public numeric id, when we have resolved one. */
    companyRef: text('company_ref'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  },
  (t) => [
    index('linked_companies_user_idx').on(t.userId),
    uniqueIndex('linked_companies_unique_idx').on(t.userId, t.realmId, t.companyName),
  ],
);

/** Point-in-time record of a linked company's public figures, for history charts. */
export const companySnapshots = pgTable(
  'company_snapshots',
  {
    linkedCompanyId: varchar('linked_company_id', { length: 32 })
      .notNull()
      .references(() => linkedCompanies.id, { onDelete: 'cascade' }),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    level: doublePrecision('level'),
    value: doublePrecision('value'),
    /** Anything else the public profile exposed, kept verbatim for later analysis. */
    raw: jsonb('raw').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.linkedCompanyId, t.observedAt] })],
);

export const alerts = pgTable(
  'alerts',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    realmId: smallint('realm_id').notNull().default(0),
    resourceId: integer('resource_id').notNull(),
    quality: smallint('quality').notNull().default(0),
    /** 'price_below' | 'price_above' | 'pct_change_up' | 'pct_change_down' */
    condition: varchar('condition', { length: 32 }).notNull(),
    threshold: doublePrecision('threshold').notNull(),
    /** Window in hours for percentage-change conditions. */
    windowHours: integer('window_hours'),
    channel: varchar('channel', { length: 16 }).notNull().default('email'),
    /** Discord webhook URL, when channel = 'discord'. Encrypted at rest. */
    destination: text('destination'),
    enabled: boolean('enabled').notNull().default(true),
    /** Minimum seconds between two firings, to stop a wobbling price spamming. */
    cooldownSeconds: integer('cooldown_seconds').notNull().default(6 * 60 * 60),
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('alerts_user_idx').on(t.userId),
    // The evaluator scans enabled alerts grouped by the market series they watch.
    index('alerts_scan_idx').on(t.enabled, t.realmId, t.resourceId),
  ],
);

export const alertEvents = pgTable(
  'alert_events',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    alertId: varchar('alert_id', { length: 32 })
      .notNull()
      .references(() => alerts.id, { onDelete: 'cascade' }),
    firedAt: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
    /** The value that satisfied the condition, for the alert history view. */
    observedValue: doublePrecision('observed_value'),
    message: text('message').notNull(),
    /** 'pending' | 'sent' | 'failed' | 'suppressed' */
    deliveryStatus: varchar('delivery_status', { length: 16 }).notNull().default('pending'),
    deliveryDetail: text('delivery_detail'),
  },
  (t) => [index('alert_events_alert_idx').on(t.alertId, t.firedAt)],
);

// ---------------------------------------------------------------------------
// 5. Operations
// ---------------------------------------------------------------------------

/** One row per background job execution. Powers the admin health view. */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    job: varchar('job', { length: 64 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 'running' | 'ok' | 'failed' */
    status: varchar('status', { length: 16 }).notNull().default('running'),
    itemsProcessed: integer('items_processed').notNull().default(0),
    error: text('error'),
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index('job_runs_job_idx').on(t.job, t.startedAt)],
);

/**
 * Privacy-respecting aggregate counters.
 *
 * Counts only — no IP addresses, no user agents, no per-visitor identifiers, nothing
 * that could re-identify a person. Enough to know which tools are worth investing in.
 */
export const metricCounters = pgTable(
  'metric_counters',
  {
    metric: varchar('metric', { length: 96 }).notNull(),
    /** Date bucket (UTC midnight). */
    day: timestamp('day', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.metric, t.day] })],
);
