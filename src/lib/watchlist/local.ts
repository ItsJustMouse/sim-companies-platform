/**
 * Browser-local watchlist.
 *
 * Stored in localStorage rather than on our servers. Anyone can use watchlists
 * without creating an account, and we hold no record of what a visitor follows —
 * data minimisation applied to a feature that genuinely does not need a database.
 *
 * Every access is wrapped: private browsing modes and blocked site data make these
 * APIs throw rather than return empty, and a watchlist failing must never break the
 * page it sits on.
 */

const KEY = 'lf-watchlist-v1';
const MAX_ITEMS = 500;

export function readWatchlist(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Stored data is user-controlled: validate rather than trust it.
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function write(ids: readonly number[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or unavailable — the in-memory state still reflects the click.
  }
}

/** Adds or removes an id. Returns the resulting watched state. */
export function toggleWatch(resourceId: number): boolean {
  const current = readWatchlist();
  const index = current.indexOf(resourceId);
  if (index >= 0) {
    current.splice(index, 1);
    write(current);
    return false;
  }
  current.push(resourceId);
  write(current);
  return true;
}

export function isWatched(resourceId: number): boolean {
  return readWatchlist().includes(resourceId);
}

export function clearWatchlist(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the list is already unreadable.
  }
}
