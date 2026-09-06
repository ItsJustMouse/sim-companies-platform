import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { alertEvents, alerts, resources } from '@/lib/db/schema';
import { marketRepository } from '@/lib/market/service';
import { priceChange } from '@/lib/market/statistics';
import { log } from '@/lib/util/logger';
import { deliver } from './deliver';
import type { JobContext, JobResult } from '@/lib/jobs/runner';

/**
 * Alert evaluation.
 *
 * Runs against stored snapshots rather than issuing its own upstream requests: an
 * alert engine that polled the game per subscription would multiply our footprint by
 * the number of users, which is precisely the failure mode the whole caching
 * architecture exists to avoid. Alerts are therefore exactly as fresh as collection,
 * and the UI says so when you create one.
 *
 * Two properties keep this from becoming a notification firehose:
 *   - a per-alert cooldown, so a price oscillating around a threshold fires once;
 *   - one evaluation per alert per pass, with delivery failures recorded rather than
 *     retried in a tight loop.
 */

export type AlertCondition = 'price_below' | 'price_above' | 'pct_change_up' | 'pct_change_down';

export interface EvaluationOutcome {
  readonly alertId: string;
  readonly fired: boolean;
  readonly reason: string;
  readonly observedValue: number | null;
}

export async function evaluateAlerts(context: JobContext): Promise<JobResult> {
  const active = await db()
    .select()
    .from(alerts)
    .where(eq(alerts.enabled, true));

  if (active.length === 0) return { itemsProcessed: 0, detail: { active: 0 } };

  const nameById = new Map<number, string>();
  const allResources = await db().select({ id: resources.resourceId, name: resources.name }).from(resources);
  for (const row of allResources) nameById.set(row.id, row.name);

  let fired = 0;
  let skipped = 0;
  let evaluated = 0;

  for (const alert of active) {
    evaluated += 1;
    context.progress(evaluated);

    // Cooldown is checked first: no point reading the market for an alert that
    // cannot fire yet.
    if (alert.lastFiredAt && Date.now() - alert.lastFiredAt.getTime() < alert.cooldownSeconds * 1000) {
      skipped += 1;
      continue;
    }

    try {
      const outcome = await evaluateOne(alert, nameById.get(alert.resourceId) ?? `Product ${alert.resourceId}`);
      if (!outcome.fired) continue;

      const eventId = randomBytes(12).toString('hex');
      await db().insert(alertEvents).values({
        id: eventId,
        alertId: alert.id,
        observedValue: outcome.observedValue,
        message: outcome.reason,
        deliveryStatus: 'pending',
      });

      await db().update(alerts).set({ lastFiredAt: new Date() }).where(eq(alerts.id, alert.id));

      const delivery = await deliver({
        channel: alert.channel,
        destination: alert.destination,
        userId: alert.userId,
        message: outcome.reason,
      });

      await db()
        .update(alertEvents)
        .set({ deliveryStatus: delivery.status, deliveryDetail: delivery.detail ?? null })
        .where(eq(alertEvents.id, eventId));

      fired += 1;
    } catch (error) {
      // One malformed alert must not stop the rest from being evaluated.
      log.warn('alert evaluation failed', { alertId: alert.id, error });
    }
  }

  return { itemsProcessed: evaluated, detail: { active: active.length, fired, skippedForCooldown: skipped } };
}

async function evaluateOne(
  alert: typeof alerts.$inferSelect,
  productName: string,
): Promise<EvaluationOutcome> {
  const snapshot = await marketRepository.latestSnapshot(alert.realmId, alert.resourceId);
  if (!snapshot) {
    return { alertId: alert.id, fired: false, reason: 'no market data', observedValue: null };
  }

  const price = marketRepository.priceAtQuality(snapshot.pricesByQuality, alert.quality, snapshot.lowestPrice);
  if (price === null) {
    return { alertId: alert.id, fired: false, reason: 'no price at this quality', observedValue: null };
  }

  const qualityLabel = alert.quality > 0 ? ` (quality ${alert.quality}+)` : '';
  const observedAt = snapshot.observedAt.toISOString();

  switch (alert.condition as AlertCondition) {
    case 'price_below':
      return price < alert.threshold
        ? {
            alertId: alert.id,
            fired: true,
            observedValue: price,
            reason: `${productName}${qualityLabel} is ${price.toFixed(4)}, below your threshold of ${alert.threshold}. Observed ${observedAt}.`,
          }
        : { alertId: alert.id, fired: false, reason: 'above threshold', observedValue: price };

    case 'price_above':
      return price > alert.threshold
        ? {
            alertId: alert.id,
            fired: true,
            observedValue: price,
            reason: `${productName}${qualityLabel} is ${price.toFixed(4)}, above your threshold of ${alert.threshold}. Observed ${observedAt}.`,
          }
        : { alertId: alert.id, fired: false, reason: 'below threshold', observedValue: price };

    case 'pct_change_up':
    case 'pct_change_down': {
      const windowHours = alert.windowHours ?? 24;
      const from = new Date(Date.now() - windowHours * 2 * 3_600_000);
      const history = await marketRepository.readHistory({
        realmId: alert.realmId,
        resourceId: alert.resourceId,
        quality: alert.quality,
        from,
        interval: 'raw',
      });

      const change = priceChange(history.points, windowHours);
      if (!change) {
        // Not enough history to measure the window is not the same as "no change".
        return { alertId: alert.id, fired: false, reason: 'insufficient history', observedValue: price };
      }

      const wantsUp = alert.condition === 'pct_change_up';
      const triggered = wantsUp ? change.percent >= alert.threshold : change.percent <= -alert.threshold;

      return triggered
        ? {
            alertId: alert.id,
            fired: true,
            observedValue: change.percent,
            reason: `${productName}${qualityLabel} moved ${change.percent.toFixed(2)}% over ${windowHours}h (${change.from.toFixed(4)} to ${change.to.toFixed(4)}), crossing your ${alert.threshold}% threshold.`,
          }
        : { alertId: alert.id, fired: false, reason: 'change within threshold', observedValue: change.percent };
    }

    default:
      return { alertId: alert.id, fired: false, reason: `unknown condition ${alert.condition}`, observedValue: price };
  }
}

/** Count of alerts a user already has, used to enforce a per-account quota. */
export async function alertCountForUser(userId: string): Promise<number> {
  const rows = await db().select({ id: alerts.id }).from(alerts).where(eq(alerts.userId, userId));
  return rows.length;
}

export async function findUserAlert(userId: string, alertId: string) {
  const [row] = await db()
    .select()
    .from(alerts)
    // Ownership is part of the lookup, not a check afterwards: this is what stops
    // one user reading or deleting another user's alert by guessing an id.
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, userId)))
    .limit(1);
  return row ?? null;
}
