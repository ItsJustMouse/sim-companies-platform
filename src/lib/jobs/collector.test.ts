import { describe, expect, it } from 'vitest';
import {
  chooseMostOverdueTickerRealm,
  nextNormalDeepSlotsSinceAlert,
  shouldPreferQualityAlert,
} from './collector';

describe('chooseMostOverdueTickerRealm', () => {
  const fifteenMinutes = 15 * 60_000;
  const now = Date.parse('2026-09-07T20:00:00.000Z');

  it('prioritises a realm that has never been collected', () => {
    expect(
      chooseMostOverdueTickerRealm(
        [
          { realmId: 0, lastTickerAtMs: now - 60 * 60_000 },
          { realmId: 1, lastTickerAtMs: null },
        ],
        now,
        fifteenMinutes,
      ),
    ).toBe(1);
  });

  it('chooses the oldest overdue realm', () => {
    expect(
      chooseMostOverdueTickerRealm(
        [
          { realmId: 0, lastTickerAtMs: now - 20 * 60_000 },
          { realmId: 1, lastTickerAtMs: now - 40 * 60_000 },
        ],
        now,
        fifteenMinutes,
      ),
    ).toBe(1);
  });

  it('treats the exact freshness boundary as due', () => {
    expect(
      chooseMostOverdueTickerRealm(
        [
          { realmId: 0, lastTickerAtMs: now - fifteenMinutes },
          { realmId: 1, lastTickerAtMs: now - 5 * 60_000 },
        ],
        now,
        fifteenMinutes,
      ),
    ).toBe(0);
  });

  it('returns null while every realm is still fresh', () => {
    expect(
      chooseMostOverdueTickerRealm(
        [
          { realmId: 0, lastTickerAtMs: now - 10 * 60_000 },
          { realmId: 1, lastTickerAtMs: now - 5 * 60_000 },
        ],
        now,
        fifteenMinutes,
      ),
    ).toBeNull();
  });

  it('allows a small scheduler tolerance near the freshness boundary', () => {
    expect(
      chooseMostOverdueTickerRealm(
        [
          { realmId: 0, lastTickerAtMs: now - (fifteenMinutes - 5_000) },
          { realmId: 1, lastTickerAtMs: now - 5 * 60_000 },
        ],
        now,
        fifteenMinutes,
        30_000,
      ),
    ).toBe(0);
  });
});

describe('deep collection fairness', () => {
  it('reserves alert priority only after three ordinary deep slots', () => {
    expect(shouldPreferQualityAlert(0)).toBe(false);
    expect(shouldPreferQualityAlert(1)).toBe(false);
    expect(shouldPreferQualityAlert(2)).toBe(false);
    expect(shouldPreferQualityAlert(3)).toBe(true);
  });

  it('increments ordinary deep slots and caps the quota at three', () => {
    expect(nextNormalDeepSlotsSinceAlert(0, false)).toBe(1);
    expect(nextNormalDeepSlotsSinceAlert(1, false)).toBe(2);
    expect(nextNormalDeepSlotsSinceAlert(2, false)).toBe(3);
    expect(nextNormalDeepSlotsSinceAlert(3, false)).toBe(3);
  });

  it('resets the quota whenever an alert product receives a deep snapshot', () => {
    expect(nextNormalDeepSlotsSinceAlert(0, true)).toBe(0);
    expect(nextNormalDeepSlotsSinceAlert(3, true)).toBe(0);
  });
});
