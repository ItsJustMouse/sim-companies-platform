import { sqlConnection } from '@/lib/db/client';
import { log } from '@/lib/util/logger';

const RATE_LIMIT_STATE_KEY = 'upstream_rate_limit';

/*
 * Session-level advisory lock shared by every Simconomist process using the
 * same PostgreSQL database.
 *
 * We hold it only while an upstream request is actually starting/running.
 * Five-minute waits happen with no database connection reserved.
 */
const ADVISORY_LOCK_NAMESPACE = 20_260_907;
const ADVISORY_LOCK_KEY = 1;

type SleepFn = (ms: number) => Promise<void>;

export interface GlobalRequestTurn {
  readonly waitMs: number;
  markStarted(): Promise<void>;
  release(): Promise<void>;
}

export type GlobalTurnAcquirer = (minIntervalMs: number) => Promise<GlobalRequestTurn>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquires the global upstream turn.
 *
 * The returned object keeps one reserved PostgreSQL session and its advisory
 * lock until release() is called.
 *
 * If waitMs > 0, the caller must release immediately, sleep, then acquire again.
 * That re-check is load-bearing: another process may have started a request while
 * this caller was asleep.
 */
export async function acquireGlobalTurn(minIntervalMs: number): Promise<GlobalRequestTurn> {
  const connection = await sqlConnection().reserve();
  let locked = false;
  let released = false;

  const release = async (): Promise<void> => {
    if (released) return;
    released = true;

    try {
      if (locked) {
        const [row] = await connection<{ unlocked: boolean }[]>`
          SELECT pg_advisory_unlock(
            ${ADVISORY_LOCK_NAMESPACE}::integer,
            ${ADVISORY_LOCK_KEY}::integer
          ) AS unlocked
        `;

        if (!row?.unlocked) {
          log.error('global upstream advisory lock was not owned during release');
        }
      }
    } finally {
      connection.release();
    }
  };

  try {
    await connection`
      SELECT pg_advisory_lock(
        ${ADVISORY_LOCK_NAMESPACE}::integer,
        ${ADVISORY_LOCK_KEY}::integer
      )
    `;
    locked = true;

    const [row] = await connection<{ wait_ms: number }[]>`
      WITH state AS (
        SELECT
          (value ->> 'nextAllowedAt')::timestamptz AS next_allowed_at,
          (value ->> 'lastStartedAt')::timestamptz AS last_started_at
        FROM system_flags
        WHERE key = ${RATE_LIMIT_STATE_KEY}
      )
      SELECT greatest(
        0,
        extract(
          epoch FROM (
            greatest(
              clock_timestamp(),
              coalesce(
                (SELECT next_allowed_at FROM state),
                '-infinity'::timestamptz
              ),
              coalesce(
                (SELECT last_started_at FROM state)
                  + (${minIntervalMs}::double precision * interval '1 millisecond'),
                '-infinity'::timestamptz
              )
            ) - clock_timestamp()
          )
        ) * 1000
      )::double precision AS wait_ms
    `;

    const waitMs = Math.max(0, Number(row?.wait_ms ?? 0));

    return {
      waitMs,

      /*
       * Called immediately after the request function has been invoked.
       *
       * The Sim Companies client reaches fetch() synchronously before its first
       * await, so this timestamp is recorded after the network attempt has begun,
       * rather than when a future slot was merely reserved.
       */
      async markStarted(): Promise<void> {
        await connection`
          WITH started AS (
            SELECT clock_timestamp() AS at
          )
          INSERT INTO system_flags (
            key,
            value,
            updated_at,
            updated_by
          )
          SELECT
            ${RATE_LIMIT_STATE_KEY},
            jsonb_build_object(
              'lastStartedAt',
              started.at,
              'nextAllowedAt',
              started.at
                + (${minIntervalMs}::double precision * interval '1 millisecond')
            ),
            started.at,
            'upstream-global-pacer'
          FROM started
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
        `;
      },

      release,
    };
  } catch (error) {
    await release().catch(() => {});

    throw new Error(
      `Unable to coordinate the global upstream request slot: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Database-backed request pacer shared by every Simconomist process that uses
 * the same PostgreSQL database.
 *
 * Normal flow:
 *   1. acquire the global advisory lock;
 *   2. if too early, release it, sleep, and re-check;
 *   3. when allowed, invoke the request;
 *   4. record its actual start while the lock is still held;
 *   5. keep the lock until that request settles.
 */
export class GlobalRequestPacer {
  constructor(
    private readonly acquire: GlobalTurnAcquirer = acquireGlobalTurn,
    private readonly sleeper: SleepFn = sleep,
  ) {}

  async schedule<T>(fn: () => Promise<T>, minIntervalMs: number): Promise<T> {
    if (minIntervalMs <= 0) return fn();

    for (;;) {
      const turn = await this.acquire(minIntervalMs);

      if (turn.waitMs > 0) {
        const roundedWaitMs = Math.ceil(turn.waitMs);

        await turn.release();

        log.debug('waiting for global upstream request interval', {
          waitMs: roundedWaitMs,
        });

        await this.sleeper(roundedWaitMs);
        continue;
      }

      /*
       * Calling fn() starts SimCompaniesHttpClient.request(), which invokes fetch()
       * synchronously before its first await. Keep the returned promise so the
       * advisory lock stays held until the HTTP attempt settles.
       */
      let requestPromise: Promise<T>;

      try {
        requestPromise = fn();
        // Mark an early rejection as handled while the DB timestamp is written.
        void requestPromise.catch(() => {});
      } catch (error) {
        await turn.release();
        throw error;
      }

      const localStartedAt = Date.now();

      try {
        await turn.markStarted();
      } catch (error) {
        /*
         * A network attempt has already started but PostgreSQL could not persist
         * its timestamp. Fail closed: keep the global lock for the remainder of
         * the minimum interval before allowing another process through.
         */
        await requestPromise.catch(() => {});

        const remainingMs = Math.max(
          0,
          minIntervalMs - (Date.now() - localStartedAt),
        );

        if (remainingMs > 0) {
          log.error('could not persist upstream start time; holding safety interval', {
            waitMs: remainingMs,
          });
          await this.sleeper(remainingMs);
        }

        await turn.release().catch(() => {});

        throw new Error(
          `Unable to persist the global upstream request start: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }

      try {
        return await requestPromise;
      } finally {
        await turn.release();
      }
    }
  }
}
