'use client';

import { useSyncExternalStore } from 'react';
import { readWatchlist, toggleWatch as writeToggle } from './local';

/**
 * Reactive view of the browser-local watchlist.
 *
 * `useSyncExternalStore` is the correct tool here rather than an effect that copies
 * localStorage into state: it gives React an explicit server snapshot (an empty
 * list, which is what the server can honestly say), avoids the mount-time cascading
 * render an effect would cause, and keeps every subscribed component in step —
 * including across browser tabs, via the `storage` event.
 */

const listeners = new Set<() => void>();

/**
 * Cached snapshot. `useSyncExternalStore` compares snapshots by identity, so this
 * must return the same array until something actually changes, or React will loop.
 */
let snapshot: readonly number[] = [];
let initialised = false;

const SERVER_SNAPSHOT: readonly number[] = [];

function refresh(): void {
  const next = readWatchlist();
  const changed = next.length !== snapshot.length || next.some((id, i) => id !== snapshot[i]);
  if (changed) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
}

function subscribe(listener: () => void): () => void {
  if (!initialised) {
    initialised = true;
    snapshot = readWatchlist();
  }
  listeners.add(listener);
  window.addEventListener('storage', refresh);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', refresh);
  };
}

function getSnapshot(): readonly number[] {
  if (!initialised) {
    initialised = true;
    snapshot = readWatchlist();
  }
  return snapshot;
}

function getServerSnapshot(): readonly number[] {
  return SERVER_SNAPSHOT;
}

export function useWatchlist(): readonly number[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Toggles an id and notifies every subscriber. */
export function toggleWatched(resourceId: number): boolean {
  const result = writeToggle(resourceId);
  refresh();
  return result;
}
