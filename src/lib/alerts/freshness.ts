/**
 * Quality-specific alerts rely on selective order-book collection rather than the
 * broad market ticker. Notifications require substantially fresher data than the
 * product page is willing to display with a stale-data warning.
 */
export const QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS = 6 * 60 * 60;

export function isQualityAlertSnapshotFresh(
  observedAt: Date,
  nowMs = Date.now(),
): boolean {
  const observedMs = observedAt.getTime();
  if (!Number.isFinite(observedMs)) return false;

  const ageMs = Math.max(0, nowMs - observedMs);
  return ageMs < QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS * 1000;
}

/**
 * Percentage-change alerts need a historical observation reasonably close to the
 * requested reference time. Keep the normal 50% tolerance for very short windows,
 * but never allow the reference point to drift by more than two hours.
 */
export const ALERT_CHANGE_MAX_REFERENCE_DRIFT_HOURS = 2;

export function alertChangeToleranceRatio(windowHours: number): number {
  if (!Number.isFinite(windowHours) || windowHours <= 0) return 0;

  return Math.min(
    0.5,
    ALERT_CHANGE_MAX_REFERENCE_DRIFT_HOURS / windowHours,
  );
}
