import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { marketCandles, marketSnapshots } from '@/lib/db/schema';
import type { MarketQuote } from '@/lib/game/types';
import type { PricePoint } from './statistics';

/**
 * Storage and retrieval of Ledgerforge's own market observations.
 *
 * This is the one dataset the platform cannot re-fetch: the game exposes only the
 * current order book, so any history the product shows is history we recorded. Every
 * read path therefore reports how far back its data actually goes, and the UI states
 * the collection start date rather than implying the series is complete.
 */

export type CandleInterval = '1h' | '1d';

export async function recordSnapshots(quotes: readonly MarketQuote[]): Promise<number> {
  if (quotes.length === 0) return 0;

  await db()
    .insert(marketSnapshots)
    .values(
      quotes.map((q) => ({
        realmId: q.realmId,
        resourceId: q.resourceId,
        observedAt: new Date(q.observedAt),
        lowestPrice: q.lowestPrice,
        highestPrice: q.highestPrice,
        medianPrice: q.medianPrice,
        weightedAveragePrice: q.weightedAveragePrice,
        totalQuantity: q.totalQuantity,
        offerCount: q.offerCount,
        pricesByQuality: q.pricesByQuality,
      })),
    )
    // A re-run of the same sweep must not fail the whole batch; the primary key
    // already pins one row per (realm, resource, instant).
    .onConflictDoNothing();

  return quotes.length;
}

export async function latestSnapshot(
  realmId: number,
  resourceId: number,
): Promise<typeof marketSnapshots.$inferSelect | null> {
  const [row] = await db()
    .select()
    .from(marketSnapshots)
    .where(and(eq(marketSnapshots.realmId, realmId), eq(marketSnapshots.resourceId, resourceId)))
    .orderBy(desc(marketSnapshots.observedAt))
    .limit(1);
  return row ?? null;
}

/** Most recent snapshot for every resource in one query, for market-wide views. */
export async function latestSnapshotPerResource(
  realmId: number,
): Promise<Map<number, typeof marketSnapshots.$inferSelect>> {
  const rows = await db()
    .select()
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.realmId, realmId),
        // DISTINCT ON is the efficient Postgres idiom for "latest row per group" and
        // uses the (realm, resource, observed_at) primary key directly.
        sql`(${marketSnapshots.resourceId}, ${marketSnapshots.observedAt}) IN (
          SELECT resource_id, max(observed_at)
          FROM market_snapshots
          WHERE realm_id = ${realmId}
          GROUP BY resource_id
        )`,
      ),
    );

  const map = new Map<number, typeof marketSnapshots.$inferSelect>();
  for (const row of rows) map.set(row.resourceId, row);
  return map;
}

/**
 * Snapshot nearest to a point in time, for every resource.
 * Used to compute market-wide movers over a window.
 */
export async function snapshotsAround(
  realmId: number,
  at: Date,
  toleranceMinutes: number,
): Promise<Map<number, typeof marketSnapshots.$inferSelect>> {
  const from = new Date(at.getTime() - toleranceMinutes * 60_000);
  const to = new Date(at.getTime() + toleranceMinutes * 60_000);

  const rows = await db()
    .select()
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.realmId, realmId),
        gte(marketSnapshots.observedAt, from),
        lte(marketSnapshots.observedAt, to),
      ),
    )
    .orderBy(asc(marketSnapshots.observedAt));

  // Keep the observation closest to the requested instant for each resource.
  const map = new Map<number, typeof marketSnapshots.$inferSelect>();
  for (const row of rows) {
    const existing = map.get(row.resourceId);
    if (
      !existing ||
      Math.abs(row.observedAt.getTime() - at.getTime()) < Math.abs(existing.observedAt.getTime() - at.getTime())
    ) {
      map.set(row.resourceId, row);
    }
  }
  return map;
}

export interface HistoryQuery {
  realmId: number;
  resourceId: number;
  quality?: number;
  from: Date;
  to?: Date;
  /** Chooses resolution. Raw snapshots for short ranges, candles for long ones. */
  interval?: CandleInterval | 'raw';
}

export interface HistorySeries {
  readonly points: PricePoint[];
  readonly candles: (typeof marketCandles.$inferSelect)[];
  readonly resolution: CandleInterval | 'raw';
  /** Earliest observation we hold for this series at any resolution. */
  readonly collectionStartedAt: string | null;
}

export async function readHistory(query: HistoryQuery): Promise<HistorySeries> {
  const to = query.to ?? new Date();
  const quality = query.quality ?? 0;
  const resolution = query.interval ?? chooseResolution(query.from, to);

  const collectionStartedAt = await earliestObservation(query.realmId, query.resourceId);

  if (resolution === 'raw') {
    const rows = await db()
      .select()
      .from(marketSnapshots)
      .where(
        and(
          eq(marketSnapshots.realmId, query.realmId),
          eq(marketSnapshots.resourceId, query.resourceId),
          gte(marketSnapshots.observedAt, query.from),
          lte(marketSnapshots.observedAt, to),
        ),
      )
      .orderBy(asc(marketSnapshots.observedAt));

    const points: PricePoint[] = [];
    for (const row of rows) {
      const price = priceAtQuality(row.pricesByQuality, quality, row.lowestPrice);
      if (price !== null) points.push({ at: row.observedAt.toISOString(), price });
    }
    return { points, candles: [], resolution, collectionStartedAt };
  }

  const candles = await db()
    .select()
    .from(marketCandles)
    .where(
      and(
        eq(marketCandles.realmId, query.realmId),
        eq(marketCandles.resourceId, query.resourceId),
        eq(marketCandles.quality, quality),
        eq(marketCandles.interval, resolution),
        gte(marketCandles.bucketStart, query.from),
        lte(marketCandles.bucketStart, to),
      ),
    )
    .orderBy(asc(marketCandles.bucketStart));

  if (candles.length > 0) {
    return {
      points: candles.map((c) => ({ at: c.bucketStart.toISOString(), price: c.close })),
      candles,
      resolution,
      collectionStartedAt,
    };
  }

  // No pre-aggregated candles for this range. Rather than showing an empty chart
  // over data we demonstrably hold, aggregate the raw snapshots on the fly. This is
  // the correct answer before the downsampling job has run at all (a fresh install)
  // and a safety net if it falls behind.
  const points = await aggregateFromSnapshots({
    realmId: query.realmId,
    resourceId: query.resourceId,
    quality,
    interval: resolution,
    from: query.from,
    to,
  });

  return { points, candles: [], resolution, collectionStartedAt };
}

/**
 * Bucketed aggregation straight from raw snapshots.
 *
 * `date_trunc` does the bucketing in Postgres so we transfer one row per bucket
 * instead of every observation. Quality 0 reads `lowest_price`; other qualities come
 * out of the `prices_by_quality` document.
 */
async function aggregateFromSnapshots(args: {
  realmId: number;
  resourceId: number;
  quality: number;
  interval: CandleInterval;
  from: Date;
  to: Date;
}): Promise<PricePoint[]> {
  const unit = args.interval === '1h' ? 'hour' : 'day';
  // `unit` is derived from a closed union above, never from user input.
  const priceExpr =
    args.quality === 0
      ? sql`lowest_price`
      : sql`(prices_by_quality ->> ${String(args.quality)})::double precision`;

  // Timestamps are bound as ISO strings and cast in SQL: the driver does not accept
  // a Date through a raw parameter, and an explicit cast removes any ambiguity about
  // how the value is interpreted.
  const rows = await sqlRows<{ bucket: string | Date; close: number | null }>(sql`
    SELECT
      date_trunc(${sql.raw(`'${unit}'`)}, observed_at) AS bucket,
      (array_agg(${priceExpr} ORDER BY observed_at DESC))[1] AS close
    FROM market_snapshots
    WHERE realm_id = ${args.realmId}
      AND resource_id = ${args.resourceId}
      AND observed_at >= ${args.from.toISOString()}::timestamptz
      AND observed_at <= ${args.to.toISOString()}::timestamptz
      AND ${priceExpr} IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  return rows
    .filter((row) => row.close !== null)
    .map((row) => ({ at: new Date(row.bucket).toISOString(), price: row.close as number }));
}

async function sqlRows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db().execute(query);
  return result as unknown as T[];
}

/**
 * Resolution policy.
 *
 * Charts should never load more than a few hundred points: past that the extra
 * detail is invisible on screen but the payload and query cost keep growing.
 */
function chooseResolution(from: Date, to: Date): CandleInterval | 'raw' {
  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  if (hours <= 48) return 'raw';
  if (hours <= 24 * 120) return '1h';
  return '1d';
}

export function priceAtQuality(
  pricesByQuality: unknown,
  quality: number,
  fallback: number | null,
): number | null {
  if (quality === 0) {
    // Quality 0 means "cheapest at any quality", which is exactly the lowest price.
    if (fallback !== null) return fallback;
  }
  if (!pricesByQuality || typeof pricesByQuality !== 'object') return fallback;
  const map = pricesByQuality as Record<string, unknown>;
  const direct = map[String(quality)];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  return quality === 0 ? fallback : null;
}

/**
 * Earliest observation we hold for a series, at any resolution.
 *
 * Must consider candles as well as raw snapshots. Retention prunes raw rows after a
 * few weeks while daily candles are kept indefinitely, so looking at snapshots alone
 * makes the site understate its own coverage — and worse, claim a collection start
 * date *later* than data the MAX chart happily draws.
 */
export async function earliestObservation(realmId: number, resourceId: number): Promise<string | null> {
  const [row] = (await db().execute(sql`
    SELECT least(
      (SELECT min(observed_at) FROM market_snapshots
        WHERE realm_id = ${realmId} AND resource_id = ${resourceId}),
      (SELECT min(bucket_start) FROM market_candles
        WHERE realm_id = ${realmId} AND resource_id = ${resourceId})
    ) AS at
  `)) as unknown as { at: Date | string | null }[];
  return toIsoOrNull(row?.at ?? null);
}

/** Overall collection start across the whole realm, for the "history since" label. */
export async function collectionStart(realmId: number): Promise<string | null> {
  const [row] = (await db().execute(sql`
    SELECT least(
      (SELECT min(observed_at) FROM market_snapshots WHERE realm_id = ${realmId}),
      (SELECT min(bucket_start) FROM market_candles  WHERE realm_id = ${realmId})
    ) AS at
  `)) as unknown as { at: Date | string | null }[];
  return toIsoOrNull(row?.at ?? null);
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function historyForResources(
  realmId: number,
  resourceIds: readonly number[],
  from: Date,
): Promise<Map<number, PricePoint[]>> {
  if (resourceIds.length === 0) return new Map();

  const rows = await db()
    .select({
      resourceId: marketSnapshots.resourceId,
      observedAt: marketSnapshots.observedAt,
      lowestPrice: marketSnapshots.lowestPrice,
    })
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.realmId, realmId),
        inArray(marketSnapshots.resourceId, [...resourceIds]),
        gte(marketSnapshots.observedAt, from),
      ),
    )
    .orderBy(asc(marketSnapshots.observedAt));

  const map = new Map<number, PricePoint[]>();
  for (const row of rows) {
    if (row.lowestPrice === null) continue;
    const list = map.get(row.resourceId) ?? [];
    list.push({ at: row.observedAt.toISOString(), price: row.lowestPrice });
    map.set(row.resourceId, list);
  }
  return map;
}
