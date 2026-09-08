import { describe, expect, it } from 'vitest';
import {
  QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS,
  isQualityAlertSnapshotFresh,
} from './freshness';

describe('isQualityAlertSnapshotFresh', () => {
  const now = Date.UTC(2026, 8, 8, 1, 0, 0);

  it('accepts a recent order-book observation', () => {
    expect(
      isQualityAlertSnapshotFresh(
        new Date(now - 60 * 60 * 1000),
        now,
      ),
    ).toBe(true);
  });

  it('accepts an observation just inside the freshness limit', () => {
    expect(
      isQualityAlertSnapshotFresh(
        new Date(
          now -
            QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS * 1000 +
            1000,
        ),
        now,
      ),
    ).toBe(true);
  });

  it('rejects an observation at the freshness boundary', () => {
    expect(
      isQualityAlertSnapshotFresh(
        new Date(
          now -
            QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS * 1000,
        ),
        now,
      ),
    ).toBe(false);
  });

  it('rejects an invalid observation time', () => {
    expect(
      isQualityAlertSnapshotFresh(new Date('invalid'), now),
    ).toBe(false);
  });
});
