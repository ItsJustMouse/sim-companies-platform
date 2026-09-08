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
