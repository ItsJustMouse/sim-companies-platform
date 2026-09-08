import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { REALMS, type RealmId } from '@/lib/game/constants';
import { log } from '@/lib/util/logger';
import {
  FLAG_KEYS,
  getCollectorScheduleFlag,
  setFlag,
} from '@/lib/db/flags';
import { snapshotMarket, snapshotOrderBook } from './ingest';
import type { JobContext, JobResult } from './runner';

export interface RealmTickerState {
  readonly realmId: RealmId;
  readonly lastTickerAtMs: number | null;
}

export type CollectionPlan =
  | {
      readonly kind: 'ticker';
      readonly realmId: RealmId;
      readonly realmSlug: string;
      readonly lastTickerAt: string | null;
      readonly reason: 'ticker-overdue';
    }
  | {
      readonly kind: 'order-book';
      readonly realmId: RealmId;
      readonly resourceId: number;
      readonly resourceName: string;
      readonly lastDeepAt: string | null;
      readonly reason: 'quality-alert' | 'oldest-deep';
      readonly hasQualityAlert: boolean;
      readonly normalDeepSlotsSinceAlertBefore: number;
    }
  | {
      readonly kind: 'idle';
      readonly reason: 'no-deep-target';
    };

/**
 * Selects the realm whose broad ticker is most overdue.
 *
 * Never-collected realms come first. Otherwise the oldest ticker wins.
 * Returning null means every realm is still inside its target freshness window.
 */
const NORMAL_DEEP_SLOTS_PER_ALERT_PRIORITY = 3;

/**
 * Quality-alert products receive a bounded priority slot after three ordinary
 * deep collections. This prevents alerts from monopolising scarce order-book
 * request capacity while still refreshing them more frequently.
 */
export function shouldPreferQualityAlert(
  normalDeepSlotsSinceAlert: number,
): boolean {
  return normalDeepSlotsSinceAlert >= NORMAL_DEEP_SLOTS_PER_ALERT_PRIORITY;
}

export function nextNormalDeepSlotsSinceAlert(
  previous: number,
  targetHadQualityAlert: boolean,
): number {
  if (targetHadQualityAlert) return 0;

  return Math.min(
    NORMAL_DEEP_SLOTS_PER_ALERT_PRIORITY,
    Math.max(0, previous) + 1,
  );
}

export function chooseMostOverdueTickerRealm(
  states: readonly RealmTickerState[],
  nowMs: number,
  dueAfterMs: number,
  toleranceMs = 0,
): RealmId | null {
  const effectiveDueAfterMs = Math.max(0, dueAfterMs - toleranceMs);

  const due = states.filter(
    (state) =>
      state.lastTickerAtMs === null ||
      nowMs - state.lastTickerAtMs >= effectiveDueAfterMs,
  );

  due.sort((a, b) => {
    if (a.lastTickerAtMs === null && b.lastTickerAtMs !== null) return -1;
    if (a.lastTickerAtMs !== null && b.lastTickerAtMs === null) return 1;

    if (
      a.lastTickerAtMs !== null &&
      b.lastTickerAtMs !== null &&
      a.lastTickerAtMs !== b.lastTickerAtMs
    ) {
      return a.lastTickerAtMs - b.lastTickerAtMs;
    }

    return a.realmId - b.realmId;
  });

  return due[0]?.realmId ?? null;
}

async function readTickerStates(): Promise<RealmTickerState[]> {
  const rows = (await db().execute(sql`
    SELECT
      realm_id,
      max(observed_at) AS last_ticker_at
    FROM market_snapshots
    WHERE source = 'ticker'
    GROUP BY realm_id
  `)) as unknown as Array<{
    realm_id: number;
    last_ticker_at: Date | string | null;
  }>;

  const observed = new Map<number, number | null>();

  for (const row of rows) {
    observed.set(row.realm_id, toMillis(row.last_ticker_at));
  }

  return REALMS.map((realm) => ({
    realmId: realm.id,
    lastTickerAtMs: observed.get(realm.id) ?? null,
  }));
}

async function readDeepTarget(
  preferQualityAlert: boolean,
): Promise<{
  realmId: RealmId;
  resourceId: number;
  resourceName: string;
  lastDeepAt: Date | string | null;
  hasQualityAlert: boolean;
} | null> {
  /*
   * Ordinary slots always choose the oldest / never-measured product.
   *
   * After three ordinary deep slots, preferQualityAlert becomes true and enabled
   * Q1+ alert products receive one bounded priority opportunity. If no such alert
   * exists, oldest-first collection simply continues.
   *
   * resource_id before realm_id causes never-measured products that exist in
   * both economies to naturally alternate realms instead of exhausting one
   * entire realm before touching the other.
   */
  const rows = (await db().execute(sql`
    SELECT
      r.realm_id,
      r.resource_id,
      r.name AS resource_name,
      deep.last_deep_at,
      EXISTS (
        SELECT 1
        FROM alerts a
        WHERE a.enabled = true
          AND a.quality > 0
          AND a.realm_id = r.realm_id
          AND a.resource_id = r.resource_id
      ) AS has_quality_alert
    FROM resources r
    LEFT JOIN LATERAL (
      SELECT max(ms.observed_at) AS last_deep_at
      FROM market_snapshots ms
      WHERE ms.realm_id = r.realm_id
        AND ms.resource_id = r.resource_id
        AND ms.source = 'order-book'
    ) deep ON true
    ORDER BY
      CASE
        WHEN ${preferQualityAlert}::boolean THEN has_quality_alert
        ELSE false
      END DESC,
      deep.last_deep_at ASC NULLS FIRST,
      r.resource_id ASC,
      r.realm_id ASC
    LIMIT 1
  `)) as unknown as Array<{
    realm_id: number;
    resource_id: number;
    resource_name: string;
    last_deep_at: Date | string | null;
    has_quality_alert: boolean;
  }>;

  const row = rows[0];
  if (!row) return null;

  const realm = REALMS.find((candidate) => candidate.id === row.realm_id);
  if (!realm) {
    log.warn('deep collector ignored unsupported realm', {
      realmId: row.realm_id,
      resourceId: row.resource_id,
    });
    return null;
  }

  return {
    realmId: realm.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    lastDeepAt: row.last_deep_at,
    hasQualityAlert: Boolean(row.has_quality_alert),
  };
}

/**
 * Database-only planning step. Safe to call with upstream access disabled.
 */
export async function planNextCollection(
  nowMs: number = Date.now(),
): Promise<CollectionPlan> {
  const config = env();
  const tickerDueAfterMs =
    config.MARKET_SNAPSHOT_INTERVAL_MINUTES * 60_000;

  const states = await readTickerStates();
  // The worker wakes on the same coarse cadence as the global request interval,
  // while observedAt is written only after the ticker response completes. Without
  // a small tolerance, a nominal 15-minute tick can see data as 14m59s old and
  // unnecessarily defer that realm until the following slot.
  //
  // This affects scheduling priority only. The PostgreSQL global pacer still
  // enforces the full UPSTREAM_MIN_INTERVAL_MS between actual request starts.
  const tickerDueToleranceMs = Math.min(30_000, tickerDueAfterMs / 10);

  const tickerRealmId = chooseMostOverdueTickerRealm(
    states,
    nowMs,
    tickerDueAfterMs,
    tickerDueToleranceMs,
  );

  if (tickerRealmId !== null) {
    const realm = REALMS.find((candidate) => candidate.id === tickerRealmId);
    if (!realm) throw new Error(`Unsupported realm ${tickerRealmId}`);

    const state = states.find((candidate) => candidate.realmId === tickerRealmId);

    return {
      kind: 'ticker',
      realmId: realm.id,
      realmSlug: realm.slug,
      lastTickerAt:
        state?.lastTickerAtMs == null
          ? null
          : new Date(state.lastTickerAtMs).toISOString(),
      reason: 'ticker-overdue',
    };
  }

  const scheduleState = await getCollectorScheduleFlag();
  const preferQualityAlert = shouldPreferQualityAlert(
    scheduleState.normalDeepSlotsSinceAlert,
  );

  const target = await readDeepTarget(preferQualityAlert);

  if (!target) {
    return {
      kind: 'idle',
      reason: 'no-deep-target',
    };
  }

  return {
    kind: 'order-book',
    realmId: target.realmId,
    resourceId: target.resourceId,
    resourceName: target.resourceName,
    lastDeepAt: toIso(target.lastDeepAt),
    reason:
      preferQualityAlert && target.hasQualityAlert
        ? 'quality-alert'
        : 'oldest-deep',
    hasQualityAlert: target.hasQualityAlert,
    normalDeepSlotsSinceAlertBefore:
      scheduleState.normalDeepSlotsSinceAlert,
  };
}

/**
 * Consumes at most one upstream request opportunity.
 *
 * The global HTTP pacer remains the final enforcement layer underneath this
 * scheduler, so duplicate workers or timer drift cannot bypass request spacing.
 */
export async function collectNextUpstream(
  context: JobContext,
): Promise<JobResult> {
  if (!env().UPSTREAM_ENABLED) {
    return {
      itemsProcessed: 0,
      detail: { reason: 'upstream-disabled' },
    };
  }

  const plan = await planNextCollection();

  if (plan.kind === 'idle') {
    return {
      itemsProcessed: 0,
      detail: plan,
    };
  }

  if (plan.kind === 'ticker') {
    const result = await snapshotMarket(context, plan.realmId);

    return {
      ...result,
      detail: {
        ...(result.detail ?? {}),
        coordinatorAction: 'ticker',
        coordinatorReason: plan.reason,
        realmId: plan.realmId,
        realmSlug: plan.realmSlug,
      },
    };
  }

  const result = await snapshotOrderBook(
    context,
    plan.realmId,
    plan.resourceId,
  );

  const nextScheduleCount = nextNormalDeepSlotsSinceAlert(
    plan.normalDeepSlotsSinceAlertBefore,
    plan.hasQualityAlert,
  );

  await setFlag(
    FLAG_KEYS.collectorSchedule,
    { normalDeepSlotsSinceAlert: nextScheduleCount },
    'upstream-collector',
  );

  return {
    ...result,
    detail: {
      ...(result.detail ?? {}),
      coordinatorAction: 'order-book',
      coordinatorReason: plan.reason,
      realmId: plan.realmId,
      resourceId: plan.resourceId,
      resourceName: plan.resourceName,
      previousDeepObservedAt: plan.lastDeepAt,
      hasQualityAlert: plan.hasQualityAlert,
      normalDeepSlotsSinceAlertBefore:
        plan.normalDeepSlotsSinceAlertBefore,
      normalDeepSlotsSinceAlertAfter: nextScheduleCount,
    },
  };
}

function toMillis(value: Date | string | null): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toIso(value: Date | string | null): string | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms).toISOString();
}
