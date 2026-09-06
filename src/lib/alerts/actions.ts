'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { alertEvents, alerts } from '@/lib/db/schema';
import { currentUser } from '@/lib/auth/session';
import { generateId } from '@/lib/auth/tokens';
import { rateLimit } from '@/lib/util/rate-limit';
import { log } from '@/lib/util/logger';
import { REALMS } from '@/lib/game/constants';
import { validateDiscordWebhook } from './deliver';

/**
 * Alert management.
 *
 * Every action re-derives the user from the session and scopes its query by that
 * user id. Ownership is part of the WHERE clause, never a check performed after
 * loading a row — that ordering is what stops one account touching another's alerts
 * by guessing an id.
 */

export interface AlertActionState {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Per-account alert quota.
 *
 * The evaluator reads stored snapshots rather than polling upstream, so alerts cost
 * database work rather than requests against the game. The cap is here to bound
 * our own cost, not to manufacture a reason to charge.
 */
const MAX_ALERTS_PER_USER = 50;

const createSchema = z.object({
  resourceId: z.coerce.number().int().min(0).max(1_000_000),
  realmId: z.coerce.number().int().refine((v) => REALMS.some((r) => r.id === v), 'Unknown realm'),
  quality: z.coerce.number().int().min(0).max(20),
  condition: z.enum(['price_below', 'price_above', 'pct_change_up', 'pct_change_down']),
  threshold: z.coerce.number().finite().min(-1e12).max(1e12),
  windowHours: z.coerce.number().int().min(1).max(720).optional(),
  channel: z.enum(['none', 'email', 'discord']),
  destination: z.string().max(500).optional(),
  cooldownHours: z.coerce.number().int().min(1).max(168),
});

export async function createAlert(_previous: AlertActionState, formData: FormData): Promise<AlertActionState> {
  const user = await currentUser();
  if (!user) return { ok: false, message: 'You need to be signed in to create alerts.' };

  const limit = await rateLimit({ key: user.id, scope: 'alert-create', limit: 20, windowSeconds: 3600 });
  if (!limit.allowed) return { ok: false, message: 'Too many alerts created recently. Try again shortly.' };

  const parsed = createSchema.safeParse({
    resourceId: formData.get('resourceId'),
    realmId: formData.get('realmId') ?? 0,
    quality: formData.get('quality') ?? 0,
    condition: formData.get('condition'),
    threshold: formData.get('threshold'),
    windowHours: formData.get('windowHours') || undefined,
    channel: formData.get('channel') ?? 'none',
    destination: String(formData.get('destination') ?? '').trim() || undefined,
    cooldownHours: formData.get('cooldownHours') ?? 6,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Those alert settings are not valid.' };
  }
  const input = parsed.data;

  const existing = await db().select({ id: alerts.id }).from(alerts).where(eq(alerts.userId, user.id));
  if (existing.length >= MAX_ALERTS_PER_USER) {
    return { ok: false, message: `You have reached the limit of ${MAX_ALERTS_PER_USER} alerts.` };
  }

  if (input.channel === 'discord') {
    if (!input.destination) return { ok: false, message: 'A Discord webhook URL is required for that channel.' };
    // Re-validated on every send too: this field would otherwise be a way to make
    // our server issue requests to arbitrary hosts.
    const check = validateDiscordWebhook(input.destination);
    if (!check.ok) return { ok: false, message: check.reason };
  }

  if ((input.condition === 'pct_change_up' || input.condition === 'pct_change_down') && !input.windowHours) {
    return { ok: false, message: 'Percentage-change alerts need a time window.' };
  }

  try {
    await db().insert(alerts).values({
      id: generateId(),
      userId: user.id,
      realmId: input.realmId,
      resourceId: input.resourceId,
      quality: input.quality,
      condition: input.condition,
      threshold: input.threshold,
      windowHours: input.windowHours ?? null,
      channel: input.channel,
      destination: input.channel === 'discord' ? (input.destination ?? null) : null,
      cooldownSeconds: input.cooldownHours * 3600,
    });
  } catch (error) {
    log.error('failed to create alert', { userId: user.id, error });
    return { ok: false, message: 'Could not save that alert. Please try again.' };
  }

  revalidatePath('/account/alerts');
  return { ok: true, message: 'Alert created.' };
}

export async function deleteAlert(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // Ownership is in the WHERE clause, so a guessed id simply matches nothing.
  await db().delete(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, user.id)));
  revalidatePath('/account/alerts');
}

export async function toggleAlert(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (!id) return;

  await db().update(alerts).set({ enabled }).where(and(eq(alerts.id, id), eq(alerts.userId, user.id)));
  revalidatePath('/account/alerts');
}

export async function listAlerts(userId: string) {
  return db().select().from(alerts).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt));
}

export async function listAlertHistory(userId: string, limit = 25) {
  return db()
    .select({
      id: alertEvents.id,
      firedAt: alertEvents.firedAt,
      message: alertEvents.message,
      status: alertEvents.deliveryStatus,
      detail: alertEvents.deliveryDetail,
      resourceId: alerts.resourceId,
    })
    .from(alertEvents)
    .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
    .where(eq(alerts.userId, userId))
    .orderBy(desc(alertEvents.firedAt))
    .limit(limit);
}
