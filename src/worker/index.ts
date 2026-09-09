/**
 * Background worker.
 *
 * Runs as a separate process from the web application. That separation matters for
 * one reason above all: exactly one process in the deployment should be talking to
 * the game's API on a schedule. Web replicas scale with traffic; the collector must
 * not. Advisory locks make a second worker harmless, but the intended topology is
 * one worker, however many web instances.
 *
 * Start with `npm run worker` and `WORKER_ENABLED=true`.
 */
import { closeDb } from '@/lib/db/client';
import { env } from '@/lib/env';
import { log } from '@/lib/util/logger';
import { runJob } from '@/lib/jobs/runner';
import { buildCandles, pruneHistory, syncCatalog } from '@/lib/jobs/ingest';
import { collectNextUpstream } from '@/lib/jobs/collector';
import { evaluateAlerts } from '@/lib/alerts/evaluate';
import { REALMS } from '@/lib/game/constants';

interface Schedule {
  name: string;
  intervalMs: number;
  /** Delay before the first run, so a restart does not fire everything at once. */
  initialDelayMs: number;
  run: () => Promise<unknown>;
}

function schedules(): Schedule[] {
  const config = env();
  const minute = 60_000;

  const result: Schedule[] = [];

  /*
   * Catalog collection remains disabled by default because its aggregate
   * endpoints are not yet verified. If explicitly enabled later, the global
   * HTTP pacer still protects it, but it shares request capacity with markets.
   */
  if (config.CATALOG_SYNC_ENABLED && config.UPSTREAM_ENABLED) {
    result.push({
      name: 'catalog-sync',
      intervalMs: config.CATALOG_SYNC_INTERVAL_MINUTES * minute,
      initialDelayMs: 0,
      run: async () => {
        for (const realm of REALMS) {
          await runJob(`catalog-sync:${realm.slug}`, (ctx) =>
            syncCatalog(ctx, realm.id),
          );
        }
      },
    });
  }

  /*
   * One global market collector, regardless of realm count.
   *
   * Each tick plans exactly one action:
   *   - an overdue whole-market ticker, or
   *   - one product's full order book.
   *
   * runJob() prevents duplicate workers from executing the coordinator
   * concurrently, while the HTTP client's PostgreSQL pacer independently
   * enforces the hard upstream spacing.
   */
  if (config.UPSTREAM_ENABLED) {
    result.push({
      name: 'upstream-collection',
      intervalMs: config.UPSTREAM_MIN_INTERVAL_MS,
      initialDelayMs: 30_000,
      run: () =>
        runJob('upstream-collection', (ctx) => collectNextUpstream(ctx)),
    });
  }

  result.push(
    {
      name: 'build-candles',
      intervalMs: 30 * minute,
      initialDelayMs: 90_000,
      run: async () => {
        for (const realm of REALMS) {
          await runJob(`build-candles:${realm.slug}`, (ctx) =>
            buildCandles(ctx, realm.id),
          );
        }
      },
    },
    {
      name: 'evaluate-alerts',
      intervalMs:
        Math.max(5, config.MARKET_SNAPSHOT_INTERVAL_MINUTES) * minute,
      initialDelayMs: 120_000,
      run: () => runJob('evaluate-alerts', (ctx) => evaluateAlerts(ctx)),
    },
    {
      name: 'prune-history',
      intervalMs: 12 * 60 * minute,
      initialDelayMs: 300_000,
      run: async () => {
        for (const realm of REALMS) {
          await runJob(`prune-history:${realm.slug}`, (ctx) =>
            pruneHistory(ctx, realm.id),
          );
        }
      },
    },
  );

  return result;
}

const timers: NodeJS.Timeout[] = [];
let stopping = false;

async function safely(schedule: Schedule): Promise<void> {
  if (stopping) return;
  try {
    await schedule.run();
  } catch (error) {
    // A failing job must never take the scheduler down with it; the next tick retries.
    log.error('scheduled job threw', { job: schedule.name, error });
  }
}

function start(): void {
  if (!env().WORKER_ENABLED) {
    log.warn('worker is disabled (WORKER_ENABLED=false); exiting without scheduling anything');
    process.exit(0);
  }

  log.info('worker starting', {
    snapshotIntervalMinutes: env().MARKET_SNAPSHOT_INTERVAL_MINUTES,
    catalogIntervalMinutes: env().CATALOG_SYNC_INTERVAL_MINUTES,
    upstreamEnabled: env().UPSTREAM_ENABLED,
  });

  for (const schedule of schedules()) {
    const kickoff = setTimeout(() => {
      void safely(schedule);
      const timer = setInterval(() => void safely(schedule), schedule.intervalMs);
      timers.push(timer);
    }, schedule.initialDelayMs);
    timers.push(kickoff);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info('worker shutting down', { signal });
  for (const timer of timers) clearTimeout(timer);
  await closeDb().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start();
