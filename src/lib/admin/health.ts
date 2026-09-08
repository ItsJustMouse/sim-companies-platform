import { desc, sql } from 'drizzle-orm';
import { db, databaseHealth, safeRead } from '@/lib/db/client';
import { jobRuns } from '@/lib/db/schema';
import { cache } from '@/lib/cache/store';
import { upstreamHealth } from '@/lib/upstream/api';
import { getFixtureFlag } from '@/lib/db/flags';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';

/**
 * System health, gathered for the admin dashboard.
 *
 * Answers the questions an operator actually asks at 2am: is collection running, how
 * stale is the data, what failed and when. Every section degrades independently, so
 * a broken cache does not blank the page that would tell you the cache is broken.
 */

export interface HealthReport {
  database: Awaited<ReturnType<typeof databaseHealth>>;
  cache: { backend: string; ok: boolean; detail?: string; entries?: number };
  upstream: ReturnType<typeof upstreamHealth>;
  fixtureData: boolean;
  collection: {
    resourceCount: number;
    snapshotCount: number;
    candleCount: number;
    latestSnapshotAt: string | null;
    oldestSnapshotAt: string | null;
    /** Products with a catalog entry but no snapshot in the last day. */
    staleProducts: number;

    /** Source-aware public status metrics for the default realm. */
    tickerSnapshotCount: number;
    orderBookSnapshotCount: number;
    latestTickerAt: string | null;
    oldestTickerAt: string | null;
    latestOrderBookAt: string | null;
    staleTickerProducts: number;
    freshDepthProducts: number;
  };
  jobs: {
    job: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    itemsProcessed: number;
    error: string | null;
  }[];
  accounts: { users: number; alerts: number; activeAlerts: number; alertEvents24h: number };
}

export async function collectHealth(): Promise<HealthReport> {
  const [database, cacheHealth, fixture] = await Promise.all([
    databaseHealth(),
    cache()
      .health()
      .catch(() => ({ backend: 'unknown', ok: false, detail: 'health probe failed' })),
    getFixtureFlag().catch(() => ({ enabled: false })),
  ]);

  const collection = await safeRead(
    async () => {
      const rows = (await db().execute(sql`
        SELECT
          (SELECT count(*) FROM resources WHERE realm_id = ${DEFAULT_REALM_ID}) AS resource_count,
          (SELECT count(*) FROM market_snapshots)                               AS snapshot_count,
          (SELECT count(*) FROM market_candles)                                 AS candle_count,
          (SELECT max(observed_at) FROM market_snapshots)                       AS latest_at,
          (SELECT min(observed_at) FROM market_snapshots)                       AS oldest_at,
          (SELECT count(*) FROM resources r
             WHERE r.realm_id = ${DEFAULT_REALM_ID}
               AND NOT EXISTS (
                 SELECT 1 FROM market_snapshots s
                 WHERE s.resource_id = r.resource_id
                   AND s.realm_id = r.realm_id
                   AND s.observed_at > now() - interval '1 day'
               ))                                                               AS stale_products,

          (SELECT count(*) FROM market_snapshots
             WHERE realm_id = ${DEFAULT_REALM_ID}
               AND source = 'ticker')                                           AS ticker_snapshot_count,
          (SELECT count(*) FROM market_snapshots
             WHERE realm_id = ${DEFAULT_REALM_ID}
               AND source = 'order-book')                                       AS order_book_snapshot_count,
          (SELECT max(observed_at) FROM market_snapshots
             WHERE realm_id = ${DEFAULT_REALM_ID}
               AND source = 'ticker')                                           AS latest_ticker_at,
          (SELECT min(observed_at) FROM market_snapshots
             WHERE realm_id = ${DEFAULT_REALM_ID}
               AND source = 'ticker')                                           AS oldest_ticker_at,
          (SELECT max(observed_at) FROM market_snapshots
             WHERE realm_id = ${DEFAULT_REALM_ID}
               AND source = 'order-book')                                       AS latest_order_book_at,
          (SELECT count(*) FROM resources r
             WHERE r.realm_id = ${DEFAULT_REALM_ID}
               AND NOT EXISTS (
                 SELECT 1 FROM market_snapshots s
                 WHERE s.resource_id = r.resource_id
                   AND s.realm_id = r.realm_id
                   AND s.source = 'ticker'
                   AND s.observed_at > now() - interval '1 day'
               ))                                                               AS stale_ticker_products,
          (SELECT count(*) FROM resources r
             WHERE r.realm_id = ${DEFAULT_REALM_ID}
               AND EXISTS (
                 SELECT 1 FROM market_snapshots s
                 WHERE s.resource_id = r.resource_id
                   AND s.realm_id = r.realm_id
                   AND s.source = 'order-book'
                   AND s.observed_at > now() - interval '96 hours'
               ))                                                               AS fresh_depth_products
      `)) as unknown as Record<string, unknown>[];
      const counts = rows[0];

      return {
        resourceCount: Number(counts?.['resource_count'] ?? 0),
        snapshotCount: Number(counts?.['snapshot_count'] ?? 0),
        candleCount: Number(counts?.['candle_count'] ?? 0),
        latestSnapshotAt: toIso(counts?.['latest_at']),
        oldestSnapshotAt: toIso(counts?.['oldest_at']),
        staleProducts: Number(counts?.['stale_products'] ?? 0),
        tickerSnapshotCount: Number(counts?.['ticker_snapshot_count'] ?? 0),
        orderBookSnapshotCount: Number(counts?.['order_book_snapshot_count'] ?? 0),
        latestTickerAt: toIso(counts?.['latest_ticker_at']),
        oldestTickerAt: toIso(counts?.['oldest_ticker_at']),
        latestOrderBookAt: toIso(counts?.['latest_order_book_at']),
        staleTickerProducts: Number(counts?.['stale_ticker_products'] ?? 0),
        freshDepthProducts: Number(counts?.['fresh_depth_products'] ?? 0),
      };
    },
    {
      resourceCount: 0,
      snapshotCount: 0,
      candleCount: 0,
      latestSnapshotAt: null,
      oldestSnapshotAt: null,
      staleProducts: 0,
      tickerSnapshotCount: 0,
      orderBookSnapshotCount: 0,
      latestTickerAt: null,
      oldestTickerAt: null,
      latestOrderBookAt: null,
      staleTickerProducts: 0,
      freshDepthProducts: 0,
    },
    'admin:collection',
  );

  const jobs = await safeRead(
    async () => {
      const rows = await db().select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(25);
      return rows.map((row) => ({
        job: row.job,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        itemsProcessed: row.itemsProcessed,
        error: row.error,
      }));
    },
    [] as HealthReport['jobs'],
    'admin:jobs',
  );

  const accounts = await safeRead(
    async () => {
      const rows = (await db().execute(sql`
        SELECT
          (SELECT count(*) FROM users)                                  AS user_count,
          (SELECT count(*) FROM alerts)                                 AS alert_count,
          (SELECT count(*) FROM alerts WHERE enabled)                   AS active_alerts,
          (SELECT count(*) FROM alert_events
             WHERE fired_at > now() - interval '1 day')                 AS events_24h
      `)) as unknown as Record<string, unknown>[];
      const row = rows[0];
      return {
        users: Number(row?.['user_count'] ?? 0),
        alerts: Number(row?.['alert_count'] ?? 0),
        activeAlerts: Number(row?.['active_alerts'] ?? 0),
        alertEvents24h: Number(row?.['events_24h'] ?? 0),
      };
    },
    { users: 0, alerts: 0, activeAlerts: 0, alertEvents24h: 0 },
    'admin:accounts',
  );

  return {
    database,
    cache: cacheHealth,
    upstream: upstreamHealth(),
    fixtureData: fixture.enabled,
    collection,
    jobs,
    accounts,
  };
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
