import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, sqlConnection } from '@/lib/db/client';
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

  /*
   * pg_advisory_lock is session-scoped. Reserve one physical postgres.js
   * connection for the lifetime of the job so acquisition and release are
   * guaranteed to happen on the same PostgreSQL session.
   */
  const connection = await sqlConnection().reserve();
  let locked = false;

  try {
    const lockResult = await connection<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${key}::bigint) AS locked
    `;

    locked = Boolean(lockResult[0]?.locked);

    if (!locked) {
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

      log.info('job completed', {
        job,
        items: result.itemsProcessed,
        durationMs: Date.now() - startedAt,
      });

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
    }
  } finally {
    if (locked) {
      await connection`
        SELECT pg_advisory_unlock(${key}::bigint)
      `.catch((error: unknown) => {
        log.error('failed to release job advisory lock', { job, error });
      });
    }

    connection.release();
  }
}

export const __testing = { jobLockKey };
