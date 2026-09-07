import { sqlConnection } from '@/lib/db/client';
import { log } from '@/lib/util/logger';

const RATE_LIMIT_STATE_KEY = 'upstream_rate_limit';

/*
 * Two signed 32-bit advisory-lock keys.
 *
 * The lock is transaction-scoped, so it is released automatically after the
 * reservation has been persisted. We never hold a database connection while
 * waiting for the reserved request time.
 */
const ADVISORY_LOCK_NAMESPACE = 20_260_907;
const ADVISORY_LOCK_KEY = 1;

type SlotReserver = (minIntervalMs: number) => Promise<number>;
type SleepFn = (ms: number) => Promise<void>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reserves one globally paced upstream-request slot.
 *
 * Returns how many milliseconds the caller must wait before using its slot.
 * Reservations are persisted in PostgreSQL, so separate Node processes and
 * process restarts all observe the same schedule.
 *
 * A crashed caller may waste a reserved slot, which is intentionally fail-safe:
 * it can make collection slower, but it cannot make Ledgerforge exceed the
 * upstream request interval.
 */
export async function reserveGlobalSlot(minIntervalMs: number): Promise<number> {
  if (minIntervalMs <= 0) return 0;

  try {
    const sql = sqlConnection();

    return await sql.begin(async (tx) => {
      await tx`
        SELECT pg_advisory_xact_lock(
          ${ADVISORY_LOCK_NAMESPACE}::integer,
          ${ADVISORY_LOCK_KEY}::integer
        )
      `;

      const [row] = await tx<{ wait_ms: number }[]>`
        WITH current_state AS (
          SELECT
            (value ->> 'nextAllowedAt')::timestamptz AS next_allowed_at
          FROM system_flags
          WHERE key = ${RATE_LIMIT_STATE_KEY}
        ),
        slot AS (
          SELECT greatest(
            clock_timestamp(),
            coalesce(
              (SELECT next_allowed_at FROM current_state),
              clock_timestamp()
            )
          ) AS scheduled_at
        ),
        saved AS (
          INSERT INTO system_flags (
            key,
            value,
            updated_at,
            updated_by
          )
          SELECT
            ${RATE_LIMIT_STATE_KEY},
            jsonb_build_object(
              'nextAllowedAt',
              slot.scheduled_at
                + (${minIntervalMs}::double precision * interval '1 millisecond')
            ),
            clock_timestamp(),
            'upstream-global-pacer'
          FROM slot
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = EXCLUDED.updated_at,
            updated_by = EXCLUDED.updated_by
          RETURNING 1
        )
        SELECT greatest(
          0,
          extract(epoch FROM (slot.scheduled_at - clock_timestamp())) * 1000
        )::double precision AS wait_ms
        FROM slot
        CROSS JOIN saved
      `;

      return Math.max(0, Number(row?.wait_ms ?? 0));
    });
  } catch (error) {
    /*
     * Fail closed. If PostgreSQL cannot coordinate the global limit, do not
     * silently fall back to a process-local limiter: multiple application
     * processes could otherwise violate the upstream policy.
     */
    throw new Error(
      `Unable to reserve the global upstream request slot: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Database-backed request pacer shared by every Ledgerforge process that uses
 * the same PostgreSQL database.
 */
export class GlobalRequestPacer {
  constructor(
    private readonly reserve: SlotReserver = reserveGlobalSlot,
    private readonly sleeper: SleepFn = sleep,
  ) {}

  async schedule<T>(fn: () => Promise<T>, minIntervalMs: number): Promise<T> {
    if (minIntervalMs <= 0) return fn();

    const waitMs = await this.reserve(minIntervalMs);

    if (waitMs > 0) {
      const roundedWaitMs = Math.ceil(waitMs);
      log.debug('waiting for global upstream request slot', {
        waitMs: roundedWaitMs,
      });
      await this.sleeper(roundedWaitMs);
    }

    return fn();
  }
}
