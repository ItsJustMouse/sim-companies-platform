'use client';

import { useSyncExternalStore } from 'react';
import { clearCompany, readCompany, writeCompany, type StoredCompany } from './local';

/**
 * Reactive store for the locally-held company.
 *
 * The state is editable *and* browser-only, which makes it awkward for plain
 * `useState`: the server cannot know it, so seeding from localStorage during render
 * causes a hydration mismatch, and copying it in with an effect causes a cascading
 * render on every mount.
 *
 * An external store solves both. The server snapshot is the empty company — the
 * honest answer for a server that cannot see the reader's storage — and the client
 * corrects it during hydration with no extra render pass.
 */

export const EMPTY_COMPANY: StoredCompany = {
  name: '',
  realmId: 0,
  cash: null,
  level: null,
  adminOverhead: 0,
  buildings: [],
  savedAt: '',
};

const listeners = new Set<() => void>();

/**
 * Cached snapshot. `useSyncExternalStore` compares by identity, so this must stay
 * referentially stable until something actually changes.
 */
let snapshot: StoredCompany | null = null;

function current(): StoredCompany {
  snapshot ??= readCompany() ?? EMPTY_COMPANY;
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function useCompany(): StoredCompany {
  return useSyncExternalStore(subscribe, current, () => EMPTY_COMPANY);
}

/** Applies an update and persists it. Accepts an updater for safe read-modify-write. */
export function updateCompany(update: (previous: StoredCompany) => StoredCompany): void {
  const next = { ...update(current()), savedAt: new Date().toISOString() };
  snapshot = next;
  // An untouched company is not worth writing; it would create storage for a visitor
  // who only looked at the page.
  if (next.name.trim() !== '' || next.buildings.length > 0) writeCompany(next);
  notify();
}

export function replaceCompany(company: StoredCompany): void {
  snapshot = company;
  writeCompany(company);
  notify();
}

export function resetCompany(): void {
  clearCompany();
  snapshot = EMPTY_COMPANY;
  notify();
}
