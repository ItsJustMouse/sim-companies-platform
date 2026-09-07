import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { marketCandles, marketSnapshots } from '@/lib/db/schema';
import { DEFAULT_REALM_ID, type RealmId } from '@/lib/game/constants';
import { catalogRepository } from '@/lib/catalog/service';
import { resourceStubFromTicker } from '@/lib/catalog/ticker';
import {
  fetchBuildings,
  fetchMarketOffers,
  fetchMarketTicker,
  fetchResourceDetail,
  fetchResources,
} from '@/lib/upstream/api';
import { buildQuote, buildTickerQuote } from '@/lib/market/quote';
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
  if (!env().CATALOG_SYNC_ENABLED) {
    log.warn('catalog sync skipped: live catalog endpoints are not yet verified');
    return {
      itemsProcessed: 0,
      detail: { reason: 'catalog-sync-disabled-pending-live-contract' },
    };
  }

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
export async function snapshotMarket(
  context: JobContext,
  realmId: RealmId = DEFAULT_REALM_ID,
): Promise<JobResult> {
  /*
   * VERIFIED LIVE:
   *   GET /api/v3/market-ticker/{realmId}/
   *
   * One request returns the headline market price for the whole realm. This replaces
   * the original one-order-book-per-resource sweep, which is incompatible with the
   * game's conservative API guidance.
   */
  const ticker = await fetchMarketTicker(realmId);
  const observedAt = new Date().toISOString();

  // The market ticker is also our cheapest verified way to discover which product
  // IDs currently exist. Create partial catalog rows so every live price can render.
  // Rich production/transport/category metadata remains null until independently
  // verified from an encyclopedia source.
  await catalogRepository.ensureTickerResources(
    realmId,
    ticker.map(resourceStubFromTicker),
  );

  const quotes: MarketQuote[] = ticker.map((entry) =>
    buildTickerQuote(entry, observedAt),
  );

  context.progress(quotes.length);

  const written = await persistQuotes(quotes);
  if (written > 0) await clearFixtureFlagIfSet();

  return {
    itemsProcessed: written,
    detail: {
      received: ticker.length,
      priced: ticker.filter((entry) => entry.price !== null).length,
      soldOut: ticker.filter((entry) => entry.soldOut).length,
      source: 'market-ticker',
      upstreamRequests: 1,
      observedAt,
    },
  };
}

/**
 * Captures one full Exchange order book.
 *
 * Unlike the whole-market ticker, this consumes one upstream request for one
 * product and therefore runs only in coordinator slots not needed by a ticker.
 */
export async function snapshotOrderBook(
  context: JobContext,
  realmId: RealmId,
  resourceId: number,
): Promise<JobResult> {
  const offers = await fetchMarketOffers(realmId, resourceId);
  const observedAt = new Date().toISOString();

  const quote = buildQuote(offers, {
    realmId,
    resourceId,
    observedAt,
  });

  context.progress(1);

  const written = await persistQuotes([quote]);
  if (written > 0) await clearFixtureFlagIfSet();

  return {
    itemsProcessed: written,
    detail: {
      realmId,
      resourceId,
      offers: offers.length,
      totalQuantity: quote.totalQuantity,
      qualities: quote.qualitiesAvailable,
      source: 'order-book',
      upstreamRequests: 1,
      observedAt,
    },
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
      const source = quality === 0 ? 'ticker' : 'order-book';
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
          AND source = ${source}
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
 * Series 0 is the headline/default price series and is not a claim that the
 * observed product quality was literally Q0. Series 1–5 are quality-specific and are
 * populated only when a snapshot actually contains measured prices for those
 * qualities. Raw order-book snapshots can retain additional quality detail.
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
