import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { systemFlags } from '@/lib/db/schema';
import { log } from '@/lib/util/logger';

/**
 * Runtime operational flags.
 *
 * Read on request paths, so every accessor swallows database errors and falls back
 * to the safe default: a flags table that is unreachable must not take the site down.
 */

export const FLAG_KEYS = {
  /**
   * Set when the database was populated by the development fixture seeder.
   * While it is set, every page renders a prominent banner stating that prices are
   * sample data. This is the mechanism that makes it impossible to mistake fixtures
   * for real game prices.
   */
  fixtureData: 'fixture_data',
  maintenance: 'maintenance',
  announcement: 'announcement',
  /** Restart-safe state for the upstream deep-collection fairness quota. */
  collectorSchedule: 'collector_schedule',
} as const;

export interface FixtureFlag {
  readonly enabled: boolean;
  readonly seededAt?: string;
  readonly note?: string;
}

export interface MaintenanceFlag {
  readonly enabled: boolean;
  readonly message?: string;
}

export interface AnnouncementFlag {
  readonly enabled: boolean;
  readonly message?: string;
  readonly level?: 'info' | 'warning';
}

export interface CollectorScheduleFlag {
  /** Number of ordinary deep slots completed since the last alert-target slot. */
  readonly normalDeepSlotsSinceAlert: number;
}

async function readFlag<T>(key: string, fallback: T): Promise<T> {
  try {
    const [row] = await db().select().from(systemFlags).where(eq(systemFlags.key, key)).limit(1);
    return (row?.value as T) ?? fallback;
  } catch (error) {
    log.warn('flag read failed', { key, error });
    return fallback;
  }
}

export async function setFlag(key: string, value: unknown, updatedBy?: string): Promise<void> {
  await db()
    .insert(systemFlags)
    .values({ key, value: value as object, updatedBy: updatedBy ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemFlags.key,
      set: { value: value as object, updatedBy: updatedBy ?? null, updatedAt: new Date() },
    });
}

export function getFixtureFlag(): Promise<FixtureFlag> {
  return readFlag<FixtureFlag>(FLAG_KEYS.fixtureData, { enabled: false });
}

export function getMaintenanceFlag(): Promise<MaintenanceFlag> {
  return readFlag<MaintenanceFlag>(FLAG_KEYS.maintenance, { enabled: false });
}

export function getAnnouncementFlag(): Promise<AnnouncementFlag> {
  return readFlag<AnnouncementFlag>(FLAG_KEYS.announcement, { enabled: false });
}

export async function getCollectorScheduleFlag(): Promise<CollectorScheduleFlag> {
  const value = await readFlag<Partial<CollectorScheduleFlag>>(
    FLAG_KEYS.collectorSchedule,
    { normalDeepSlotsSinceAlert: 0 },
  );

  const raw = value.normalDeepSlotsSinceAlert;

  return {
    normalDeepSlotsSinceAlert:
      typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
        ? Math.min(raw, 3)
        : 0,
  };
}
