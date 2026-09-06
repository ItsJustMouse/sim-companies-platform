'use client';

import { useSyncExternalStore } from 'react';

type Mode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lf-theme';

/**
 * Theme control.
 *
 * Defaults to the operating system preference and only writes an attribute when the
 * reader explicitly overrides it, so the site follows system dark mode out of the box.
 * The choice is a per-browser convenience, so localStorage is the right home for it —
 * and every access is guarded, because private modes make it throw rather than
 * return empty.
 *
 * State is read through `useSyncExternalStore` so the server renders a stable
 * placeholder and the client corrects it without a mount-time cascading render.
 */

const listeners = new Set<() => void>();
let cached: Mode | null = null;

function read(): Mode {
  if (cached !== null) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    cached = stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    cached = 'system';
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', invalidate);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', invalidate);
  };
}

function invalidate(): void {
  cached = null;
  for (const listener of listeners) listener();
}

function apply(mode: Mode): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);

  try {
    if (mode === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Non-fatal: the attribute is already set, so the theme applies for this session.
  }
  cached = mode;
  for (const listener of listeners) listener();
}

const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Mode, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };
const GLYPH: Record<Mode, string> = { system: '\u25D0', light: '\u2600', dark: '\u263E' };

export function ThemeToggle() {
  // The server cannot know the reader's stored choice, so it renders the neutral
  // "system" state and the client replaces it on hydration.
  const mode = useSyncExternalStore(subscribe, read, () => 'system' as Mode);

  return (
    <button
      type="button"
      onClick={() => apply(NEXT[mode])}
      title={`${LABEL[mode]} \u2014 click to change`}
      aria-label={`${LABEL[mode]}. Click to switch to ${LABEL[NEXT[mode]].toLowerCase()}.`}
      className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
    >
      <span aria-hidden="true">{GLYPH[mode]}</span>
    </button>
  );
}
