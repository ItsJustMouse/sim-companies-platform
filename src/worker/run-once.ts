/**
 * Runs one ingestion pass and exits.
 *
 * Two uses: bootstrapping a fresh database, and running collection from an external
 * scheduler (a platform cron job, a Kubernetes CronJob) instead of a long-lived
 * worker process. The historical `snapshot` step is retained as a CLI alias for
 * one globally coordinated upstream collection slot.
 *
 * Both topologies are supported; see docs/DEPLOYMENT.md.
 */
import { closeDb } from '@/lib/db/client';
import { runJob } from '@/lib/jobs/runner';
import { buildCandles, pruneHistory, syncCatalog } from '@/lib/jobs/ingest';
import { collectNextUpstream } from '@/lib/jobs/collector';
import { evaluateAlerts } from '@/lib/alerts/evaluate';
import { DEFAULT_REALM_ID, REALMS, type RealmId } from '@/lib/game/constants';
import { log } from '@/lib/util/logger';

const STEPS = ['catalog', 'snapshot', 'candles', 'alerts', 'prune'] as const;
type Step = (typeof STEPS)[number];

async function main(): Promise<void> {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const steps: Step[] = requested.length > 0 ? (requested.filter(isStep) as Step[]) : [...STEPS];

  const realmArg = process.argv.find((a) => a.startsWith('--realm='))?.split('=')[1];
  const realmId: RealmId =
    (REALMS.find((r) => r.slug === realmArg || String(r.id) === realmArg)?.id as RealmId | undefined) ??
    DEFAULT_REALM_ID;

  if (requested.length > 0 && steps.length !== requested.length) {
    throw new Error(`Unknown step. Valid steps: ${STEPS.join(', ')}`);
  }

  for (const step of steps) {
    switch (step) {
      case 'catalog':
        await runJob(`catalog-sync:${realmId}`, (ctx) => syncCatalog(ctx, realmId));
        break;
      case 'snapshot':
        // Backward-compatible CLI name. Market collection is now globally
        // coordinated, so this consumes at most one upstream collection slot
        // rather than forcing a ticker request for the selected realm.
        await runJob('upstream-collection', (ctx) => collectNextUpstream(ctx));
        break;
      case 'candles':
        await runJob(`build-candles:${realmId}`, (ctx) => buildCandles(ctx, realmId));
        break;
      case 'alerts':
        await runJob('evaluate-alerts', (ctx) => evaluateAlerts(ctx));
        break;
      case 'prune':
        await runJob(`prune-history:${realmId}`, (ctx) => pruneHistory(ctx, realmId));
        break;
    }
  }

  await closeDb();
}

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

main().catch(async (error: unknown) => {
  log.error('ingestion pass failed', { error });
  await closeDb().catch(() => {});
  process.exit(1);
});
