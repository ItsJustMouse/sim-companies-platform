import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { marketCandles, marketSnapshots } from '@/lib/db/schema';
import { DEFAULT_REALM_ID, type RealmId } from '@/lib/game/constants';
import { catalogRepository } from '@/lib/catalog/service';
import { fetchBuildings, fetchMarketOffers, fetchResourceDetail, fetchResources } from '@/lib/upstream/api';
import { buildQuote } from '@/lib/market/quote';
import { persistQuotes } from '@/lib/market/service';
import { FLAG_KEYS, setFlag } from '@/lib/db/flags';
import { log } from '@/lib/util/logger';
import { env } from '@/lib/env';
import type { JobContext, JobResult } from './runner';
import type { MarketQuote } from '@/lib/game/types';

/**
 * The ingestion jobs.
 *
 * These are the only things in the system that talk to the game's API on a schedule,
 * and they are written around one constraint: the API is undocumented, unsupported,
 * and its operators ask third parties not to poll aggressively. Everything here
 * exists to keep our footprint small — one collector for the whole site, paced
 * requests, and a snapshot interval measured in minutes rather than seconds.
 */

/** Refreshes the game catalog: resources, buildings and recipes. */
export async function syncCatalog(context: JobContext, realmId: RealmId = DEFAULT_REALM_ID): Promise<JobResult> {
  const resources = await fetchResources(realmId);
  await catalogRepository.upsertResources(realmId, resources);
  context.progress(resources.length);

  const buildings = await fetchBuildings(realmId);
  await catalogRepository.upsertBuildings(realmId, buildings);

  // Recipes are one request per resource, which is by far the largest call volume in
  // the system. They change only when the game ships an update, so this job runs
  // twice a day rather than continuously, and each request is paced by the client.
  let recipeCount = 0;
  let recipeFailures = 0;
  for (const resource of resources) {
    try {
      const recipe = await fetchResourceDetail(realmId, resource.id);
      if (recipe) {
        await catalogRepository.upsertRecipe(realmId, recipe);
        recipeCount += 1;
      }
    } catch (error) {
      // One bad resource must not abandon the rest of the catalog.
      recipeFailures += 1;
      log.warn('recipe sync failed for resource', { resourceId: resource.id, error });
    }
    context.progress(resources.length + recipeCount);
  }

  // Real catalog data has arrived, so any fixture marker is now false.
  await clearFixtureFlagIfSet();

  return {
    itemsProcessed: resources.length + buildings.length + recipeCount,
    detail: { resources: resources.length, buildings: buildings.length, recipes: recipeCount, recipeFailures },
  };
}

/**
 * Sweeps the Exchange: one order book per resource, collapsed to a snapshot.
 *
 * This is the job that builds the historical dataset. The game publishes no price
 * history, so every chart on the site is made of rows this function wrote.
 */
export async function snapshotMarket(context: JobContext, realmId: RealmId = DEFAULT_REALM_ID): Promise<JobResult> {
  const resources = await catalogRepository.listResources(realmId);
  if (resources.length === 0) {
    log.warn('market snapshot skipped: catalog is empty, run the catalog sync first');
    return { itemsProcessed: 0, detail: { reason: 'empty-catalog' } };
  }

  // One timestamp for the whole sweep, so a cross-sectional query ("everything as of
  // time T") returns a coherent picture rather than a smear across several minutes.
  const observedAt = new Date().toISOString();

  const quotes: MarketQuote[] = [];
  let failures = 0;
  let emptyBooks = 0;

  for (const resource of resources) {
    try {
      const offers = await fetchMarketOffers(realmId, resource.id);
      if (offers.length === 0) emptyBooks += 1;
      quotes.push(buildQuote(offers, { resourceId: resource.id, realmId, observedAt }));
    } catch (error) {
      failures += 1;
      log.warn('market fetch failed for resource', { resourceId: resource.id, error });
    }
    context.progress(quotes.length);
  }

  const written = await persistQuotes(quotes);
  if (written > 0) await clearFixtureFlagIfSet();

  return {
    itemsProcessed: written,
    detail: { requested: resources.length, failures, emptyBooks, observedAt },
  };
}

/**
 * Rolls raw snapshots up into hourly and daily candles.
 *
 * Without this a one-year chart would read tens of thousands of rows to draw a few
 * hundred pixels. Aggregation happens in Postgres — moving the rows into Node to
 * reduce them would be the same work plus a network transfer.
 *
 * Runs over a trailing window rather than the whole table so its cost stays flat as
 * history grows; buckets are upserted, so re-running is safe and repairs gaps.
 */
export async function buildCandles(context: JobContext, realmId: RealmId = DEFAULT_REALM_ID): Promise<JobResult> {
  let total = 0;
  for (const interval of ['1h', '1d'] as const) {
    // A window wide enough to fix a job that has been failing for a while, but far
    // short of a full-table rewrite.
    const lookbackDays = interval === '1h' ? 10 : 120;
    const unit = interval === '1h' ? 'hour' : 'day';

    for (const quality of QUALITY_SERIES) {
      const priceExpr =
        quality === 0
          ? sql`lowest_price`
          : sql`(prices_by_quality ->> ${String(quality)})::double precision`;

      const result = await db().execute(sql`
        INSERT INTO market_candles (
          realm_id, resource_id, quality, interval, bucket_start,
          open, high, low, close, average, average_quantity, sample_count
        )
        SELECT
          realm_id,
          resource_id,
          ${quality}::smallint,
          ${interval},
          date_trunc(${sql.raw(`'${unit}'`)}, observed_at) AS bucket_start,
          (array_agg(${priceExpr} ORDER BY observed_at ASC))[1]  AS open,
          max(${priceExpr})                                       AS high,
          min(${priceExpr})                                       AS low,
          (array_agg(${priceExpr} ORDER BY observed_at DESC))[1] AS close,
          avg(${priceExpr})                                       AS average,
          avg(total_quantity)                                     AS average_quantity,
          count(*)                                                AS sample_count
        FROM market_snapshots
        WHERE realm_id = ${realmId}
          AND observed_at >= now() - ${sql.raw(`interval '${lookbackDays} days'`)}
          AND ${priceExpr} IS NOT NULL
        GROUP BY realm_id, resource_id, bucket_start
        ON CONFLICT (realm_id, resource_id, quality, interval, bucket_start) DO UPDATE SET
          open = excluded.open,
          high = excluded.high,
          low = excluded.low,
          close = excluded.close,
          average = excluded.average,
          average_quantity = excluded.average_quantity,
          sample_count = excluded.sample_count
      `);

      const count = rowCount(result);
      total += count;
      context.progress(total);
    }
  }

  return { itemsProcessed: total, detail: { intervals: ['1h', '1d'], qualities: QUALITY_SERIES.length } };
}

/**
 * Which quality series get their own candles.
 *
 * Every quality would multiply the table size for series almost nobody charts.
 * Quality 0 (cheapest at any quality) is the headline series; 1–5 covers the range
 * where quality premiums are routinely compared. Raw snapshots retain every quality,
 * so a rarely-viewed series is still answerable — just from raw data.
 */
const QUALITY_SERIES = [0, 1, 2, 3, 4, 5] as const;

/**
 * Retention.
 *
 * Raw snapshots are the expensive rows and their detail stops mattering once they
 * have been rolled into candles. Candles are cheap and cannot be reconstructed once
 * the raw rows are gone, so daily candles are kept indefinitely.
 */
export async function pruneHistory(_context: JobContext, realmId: RealmId = DEFAULT_REALM_ID): Promise<JobResult> {
  const rawCutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 3_600_000);
  const hourlyCutoff = new Date(Date.now() - HOURLY_RETENTION_DAYS * 24 * 3_600_000);

  const deletedRaw = await db()
    .delete(marketSnapshots)
    .where(and(eq(marketSnapshots.realmId, realmId), lt(marketSnapshots.observedAt, rawCutoff)));

  const deletedHourly = await db()
    .delete(marketCandles)
    .where(
      and(
        eq(marketCandles.realmId, realmId),
        eq(marketCandles.interval, '1h'),
        lt(marketCandles.bucketStart, hourlyCutoff),
      ),
    );

  return {
    itemsProcessed: rowCount(deletedRaw) + rowCount(deletedHourly),
    detail: {
      rawDeleted: rowCount(deletedRaw),
      hourlyCandlesDeleted: rowCount(deletedHourly),
      rawRetentionDays: RAW_RETENTION_DAYS,
      hourlyRetentionDays: HOURLY_RETENTION_DAYS,
    },
  };
}

export const RAW_RETENTION_DAYS = 21;
export const HOURLY_RETENTION_DAYS = 400;

function rowCount(result: unknown): number {
  if (result && typeof result === 'object' && 'count' in result) {
    const count = (result as { count?: unknown }).count;
    if (typeof count === 'number') return count;
  }
  if (Array.isArray(result)) return result.length;
  return 0;
}

async function clearFixtureFlagIfSet(): Promise<void> {
  // Once real observations exist the sample-data banner must come down by itself;
  // leaving it to a human would mean the site eventually cries wolf.
  if (env().NODE_ENV === 'production') return;
  try {
    await setFlag(FLAG_KEYS.fixtureData, { enabled: false }, 'ingest');
  } catch {
    // Non-fatal: the banner is conservative in the safe direction.
  }
}
