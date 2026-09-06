'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

interface Hit {
  kind: 'product' | 'building' | 'tool' | 'guide';
  title: string;
  href: string;
  subtitle?: string;
}

const EMPTY_HITS: Hit[] = [];

const KIND_LABEL: Record<Hit['kind'], string> = {
  product: 'Product',
  building: 'Building',
  tool: 'Tool',
  guide: 'Guide',
};

/**
 * Site-wide search.
 *
 * A combobox following the ARIA authoring practices: the input keeps focus, results
 * are announced through aria-live, and arrow keys move a virtual cursor via
 * aria-activedescendant. Queries are debounced and each new one aborts the last, so
 * fast typing produces one request rather than one per keystroke.
 */
export function UniversalSearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [fetchedHits, setFetchedHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere, unless the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // An empty query has no results by definition, so that case is derived rather
  // than written back into state from an effect.
  const trimmed = query.trim();
  const hits = trimmed.length === 0 ? EMPTY_HITS : fetchedHits;

  useEffect(() => {
    if (trimmed.length === 0) return;

    const controller = new AbortController();
    // setLoading lives inside the debounce callback rather than in the effect body:
    // a synchronous state write on every keystroke would cascade a render before the
    // request has even been scheduled.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { hits: [] }))
        .then((data: { hits?: Hit[] }) => {
          setFetchedHits(data.hits ?? []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          // Aborted or failed: leave the previous results rather than flashing empty.
        })
        .finally(() => setLoading(false));
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    setOpen(false);
    setQuery('');
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-md">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search products, buildings, calculators and guides
      </label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-opt-${active}` : undefined}
        autoComplete="off"
        value={query}
        placeholder="Search products, tools and guides…"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)] focus:bg-[var(--surface)]"
      />

      <div className="sr-only" role="status" aria-live="polite">
        {open && query ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : ''}
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-xl"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
              {loading ? 'Searching…' : `Nothing matches “${query}”.`}
            </li>
          ) : (
            hits.map((hit, index) => (
              <li key={hit.href} id={`${listId}-opt-${index}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(hit)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left',
                    index === active ? 'bg-[var(--surface-hover)]' : '',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--text)]">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="block truncate text-xs text-[var(--text-faint)]">{hit.subtitle}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
                    {KIND_LABEL[hit.kind]}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
