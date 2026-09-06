import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { jobRuns } from '@/lib/db/schema';
import { log } from '@/lib/util/logger';

/**
 * Background job execution.
 *
 * Two properties matter here and both come from Postgres rather than a queue service:
 *
 *   1. **Mutual exclusion.** A Postgres advisory lock guarantees exactly one worker
 *      runs a given job at a time, even across replicas or during a rolling deploy.
 *      Two workers both sweeping the market would double our request rate against an
 *      API whose operators have asked third parties to be gentle — the one thing this
 *      system must never do.
 *   2. **An audit trail.** Every run is recorded with its outcome, so the admin
 *      dashboard can answer "when did collection last succeed" without guessing.
 *
 * Deliberately not BullMQ or pg-boss: this is a handful of periodic jobs with no
 * fan-out, retries-with-backoff or priority requirements. A dependency that brings a
 * broker, its own schema and its own failure modes would cost more than it saves.
 */

export interface JobContext {
  readonly runId: string;
  /** Records progress so a long sweep is observable while it is still running. */
  progress(items: number): void;
}

export interface JobResult {
  itemsProcessed: number;
  detail?: Record<string, unknown>;
}

function jobLockKey(job: string): string {
  // Advisory locks are keyed by a 64-bit integer, so hash the job name into one.
  // FNV-1a: tiny, stable, and collisions between our own fixed job names are
  // checkable by inspection.
  let hash = 0xcbf29ce484222325n;
  for (const char of job) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  // Postgres advisory locks take a signed bigint. It is bound as a string and cast
  // in SQL because the driver has no bigint parameter type.
  return BigInt.asIntN(64, hash).toString();
}

export async function runJob(
  job: string,
  handler: (context: JobContext) => Promise<JobResult>,
): Promise<JobResult | null> {
  const key = jobLockKey(job);

  const lockResult = (await db().execute(
    sql`SELECT pg_try_advisory_lock(${key}::bigint) AS locked`,
  )) as unknown as { locked: boolean }[];

  if (!lockResult[0]?.locked) {
    log.info('job already running elsewhere, skipping', { job });
    return null;
  }

  const runId = randomBytes(12).toString('hex');
  let processed = 0;

  await db()
    .insert(jobRuns)
    .values({ id: runId, job, status: 'running' })
    .catch((error: unknown) => log.warn('could not record job start', { job, error }));

  const startedAt = Date.now();
  try {
    const result = await handler({
      runId,
      progress: (items) => {
        processed = items;
      },
    });

    await db()
      .update(jobRuns)
      .set({
        status: 'ok',
        finishedAt: new Date(),
        itemsProcessed: result.itemsProcessed,
        detail: { ...(result.detail ?? {}), durationMs: Date.now() - startedAt },
      })
      .where(sql`${jobRuns.id} = ${runId}`)
      .catch((error: unknown) => log.warn('could not record job success', { job, error }));

    log.info('job completed', { job, items: result.itemsProcessed, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db()
      .update(jobRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        itemsProcessed: processed,
        error: message.slice(0, 2000),
        detail: { durationMs: Date.now() - startedAt },
      })
      .where(sql`${jobRuns.id} = ${runId}`)
      .catch(() => {});

    log.error('job failed', { job, error: message });
    throw error;
  } finally {
    // Released even on failure; holding a lock after a crash would stall the job
    // until the connection died on its own.
    await db()
      .execute(sql`SELECT pg_advisory_unlock(${key}::bigint)`)
      .catch(() => {});
  }
}

export const __testing = { jobLockKey };
