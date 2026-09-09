import { describe, expect, it } from 'vitest';
import {
  ALERT_CHANGE_MAX_REFERENCE_DRIFT_HOURS,
  QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS,
  alertChangeToleranceRatio,
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

describe('alertChangeToleranceRatio', () => {
  it('keeps the normal half-window tolerance for a one-hour alert', () => {
    expect(alertChangeToleranceRatio(1)).toBe(0.5);
  });

  it('caps a six-hour alert at the maximum reference drift', () => {
    expect(
      alertChangeToleranceRatio(6) * 6,
    ).toBeCloseTo(ALERT_CHANGE_MAX_REFERENCE_DRIFT_HOURS, 10);
  });

  it('caps a seven-day alert at the same absolute drift', () => {
    expect(
      alertChangeToleranceRatio(168) * 168,
    ).toBeCloseTo(ALERT_CHANGE_MAX_REFERENCE_DRIFT_HOURS, 10);
  });

  it('rejects invalid windows', () => {
    expect(alertChangeToleranceRatio(0)).toBe(0);
    expect(alertChangeToleranceRatio(-1)).toBe(0);
    expect(alertChangeToleranceRatio(Number.NaN)).toBe(0);
  });
});
