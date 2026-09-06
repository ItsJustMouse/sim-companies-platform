'use client';

import clsx from 'clsx';
import { toggleWatched } from '@/lib/watchlist/store';

/**
 * Star toggle for the local watchlist.
 *
 * Watchlists work without an account: the list lives in this browser's localStorage.
 * That is a deliberate privacy choice — following a product is not something that
 * needs to be recorded on a server for the feature to work. Signed-in users can opt
 * into syncing it across devices.
 */
export function WatchButton({ resourceId, name, watched }: { resourceId: number; name: string; watched: boolean }) {
  return (
    <button
      type="button"
      onClick={() => toggleWatched(resourceId)}
      aria-pressed={watched}
      title={watched ? `Remove ${name} from your watchlist` : `Add ${name} to your watchlist`}
      className={clsx(
        'rounded p-1 text-sm leading-none transition-colors',
        watched ? 'text-[var(--accent)]' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
      )}
    >
      <span aria-hidden="true">{watched ? '★' : '☆'}</span>
      <span className="sr-only">{watched ? `${name} is on your watchlist` : `Add ${name} to watchlist`}</span>
    </button>
  );
}
