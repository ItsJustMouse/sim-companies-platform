'use client';

import type { CompanyBuilding, CompanyState } from '@/lib/advisor/types';

/**
 * Local company workspace.
 *
 * Your company data never leaves your browser.
 *
 * That is not a nice-to-have here, it is forced by the facts: the game exposes no
 * OAuth, no API tokens and no third-party authorisation of any kind, so the only way
 * a server could read a player's private company data is by holding their game
 * credentials. We will not ask for those, and no feature is worth teaching players
 * that handing their game login to a fan site is normal (docs/SECURITY.md).
 *
 * So the workspace is local storage, the advisor runs in the browser, and nothing
 * here is transmitted anywhere. The cost is no cross-device sync and no alerts while
 * the browser is closed; both are stated plainly in the UI rather than buried.
 */

const KEY = 'lf-company-v1';

export interface StoredCompany {
  readonly name: string;
  readonly realmId: number;
  readonly cash: number | null;
  readonly level: number | null;
  readonly adminOverhead: number;
  readonly buildings: readonly CompanyBuilding[];
  readonly savedAt: string;
}

export function readCompany(): StoredCompany | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCompany(company: StoredCompany): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(company));
  } catch {
    // Storage unavailable — the in-memory state still drives this session.
  }
}

export function clearCompany(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Already unreadable.
  }
}

/**
 * Validates anything read back from storage or pasted by the user.
 *
 * Stored data is user-controlled and can be hand-edited, so it is treated as
 * untrusted input: unknown shapes are rejected, strings are length-capped, and
 * numbers are bounded rather than trusted.
 */
export function validate(value: unknown): StoredCompany | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const name = typeof raw['name'] === 'string' ? raw['name'].slice(0, 80) : null;
  if (!name) return null;

  const buildings = Array.isArray(raw['buildings'])
    ? raw['buildings']
        .slice(0, 500)
        .map(validateBuilding)
        .filter((b): b is CompanyBuilding => b !== null)
    : [];

  return {
    name,
    realmId: boundedInt(raw['realmId'], 0, 1) ?? 0,
    cash: boundedNumber(raw['cash'], 0, 1e15),
    level: boundedInt(raw['level'], 0, 1000),
    adminOverhead: boundedNumber(raw['adminOverhead'], 0, 100) ?? 0,
    buildings,
    savedAt: typeof raw['savedAt'] === 'string' ? raw['savedAt'] : new Date().toISOString(),
  };
}

function validateBuilding(value: unknown): CompanyBuilding | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const label = typeof raw['label'] === 'string' ? raw['label'].slice(0, 60) : null;
  if (!label) return null;

  return {
    label,
    kind: typeof raw['kind'] === 'string' ? raw['kind'].slice(0, 80) : null,
    level: boundedInt(raw['level'], 0, 1000) ?? 1,
    producingResourceId: boundedInt(raw['producingResourceId'], 0, 1_000_000),
    idle: raw['idle'] === true,
  };
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  const n = boundedNumber(value, min, max);
  return n === null ? null : Math.round(n);
}

export function toCompanyState(stored: StoredCompany): CompanyState {
  return {
    name: stored.name,
    realmId: stored.realmId,
    source: 'manual',
    cash: stored.cash,
    level: stored.level,
    reportedValue: null,
    adminOverhead: stored.adminOverhead / 100,
    buildings: stored.buildings,
    inventory: [],
    capturedAt: stored.savedAt,
  };
}
