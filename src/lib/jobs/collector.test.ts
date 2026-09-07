import { describe, expect, it } from 'vitest';
import { chooseMostOverdueTickerRealm } from './collector';

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
