'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { advise } from '@/lib/advisor/advise';
import type { Building, Recipe, Resource } from '@/lib/game/types';
import type { MarketRow } from '@/lib/market/service';
import { toCompanyState, validate, type StoredCompany } from '@/lib/company/local';
import { resetCompany, replaceCompany, updateCompany, useCompany } from '@/lib/company/store';
import { Card, CardHeader, Callout, Badge, EmptyState } from '@/components/ui/primitives';
import { NumberField, SelectField } from '@/components/calculators/fields';
import { money, relativeTime } from '@/lib/util/format';

/**
 * The company workspace.
 *
 * Everything on this screen — the company you describe, and the advice derived from
 * it — is computed in your browser and stored only there. That is stated at the top
 * of the page, not in a footnote, because a player deciding whether to type their
 * company into a fan site deserves to know before they start rather than after.
 */

export interface WorkspaceCatalog {
  resources: Resource[];
  buildings: Building[];
  recipes: Recipe[];
  rows: { resourceId: number; row: MarketRow }[];
  observedAt: string | null;
}

export function CompanyWorkspace({ catalog }: { catalog: WorkspaceCatalog }) {
  // Read through an external store rather than an effect: the value is browser-only
  // and editable, and copying it into state on mount would cascade a render.
  const company = useCompany();
  const [importError, setImportError] = useState<string | null>(null);

  const indexes = useMemo(
    () => ({
      resources: new Map(catalog.resources.map((r) => [r.id, r])),
      buildings: new Map(catalog.buildings.map((b) => [b.kind, b])),
      recipes: new Map(catalog.recipes.map((r) => [r.outputResourceId, r])),
      rows: new Map(catalog.rows.map((entry) => [entry.resourceId, entry.row])),
    }),
    [catalog],
  );

  const advice = useMemo(
    () =>
      advise({
        company: toCompanyState(company),
        rows: indexes.rows,
        resources: indexes.resources,
        buildings: indexes.buildings,
        recipes: indexes.recipes,
      }),
    [company, indexes],
  );

  function addBuilding() {
    updateCompany((current) => ({
      ...current,
      buildings: [
        ...current.buildings,
        {
          label: `Building ${current.buildings.length + 1}`,
          kind: catalog.buildings[0]?.kind ?? null,
          level: 1,
          // A new building has nothing assigned, so it starts idle. The select
          // below shows "Nothing (idle)" for exactly this state; defaulting to
          // false would make the control disagree with the data behind it.
          producingResourceId: null,
          idle: true,
        },
      ],
    }));
  }

  function updateBuilding(index: number, patch: Partial<StoredCompany['buildings'][number]>) {
    updateCompany((current) => ({
      ...current,
      buildings: current.buildings.map((building, i) => (i === index ? { ...building, ...patch } : building)),
    }));
  }

  function exportJson() {
    const blob = JSON.stringify({ ...company, savedAt: new Date().toISOString() }, null, 2);
    void navigator.clipboard?.writeText(blob).catch(() => {});
    setImportError(null);
  }

  function importJson(text: string) {
    try {
      const parsed = validate(JSON.parse(text));
      if (!parsed) {
        setImportError('That does not look like a Simconomist company export.');
        return;
      }
      replaceCompany(parsed);
      setImportError(null);
    } catch {
      setImportError('That is not valid JSON.');
    }
  }

  const productsFor = (kind: string | null) => {
    if (!kind) return catalog.resources;
    const building = indexes.buildings.get(kind);
    if (!building) return catalog.resources;
    const ids = new Set(
      building.production
        .map((line) => line.resourceId)
        .filter((id): id is number => id !== null),
    );
    for (const recipe of catalog.recipes) {
      if (recipe.producedIn.includes(kind)) ids.add(recipe.outputResourceId);
    }
    const list = catalog.resources.filter((r) => ids.has(r.id));
    return list.length > 0 ? list : catalog.resources;
  };

  return (
    <div className="space-y-5">
      <Callout tone="info" title="This stays in your browser">
        Sim Companies has no way for a third-party site to read your company, and we will never ask for your game
        password or session. So you describe your company here, it is saved only in this browser, and the analysis
        below runs on your own device. Nothing on this page is sent to our servers.
      </Callout>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Your company" />
            <div className="space-y-4 p-4">
              <label className="block">
                <span className="block text-xs font-medium text-[var(--text-muted)]">Company name</span>
                <input
                  type="text"
                  value={company.name}
                  maxLength={80}
                  placeholder="For your own reference"
                  onChange={(event) => updateCompany((c) => ({ ...c, name: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
                />
              </label>

              <NumberField
                label="Available cash"
                unit="$"
                value={company.cash ?? 0}
                min={0}
                max={1e15}
                step={1000}
                onChange={(value) => updateCompany((c) => ({ ...c, cash: value }))}
              />

              <NumberField
                label="Administration overhead"
                unit="%"
                value={company.adminOverhead}
                min={0}
                max={100}
                step={0.1}
                onChange={(value) => updateCompany((c) => ({ ...c, adminOverhead: value }))}
                hint="From your company overview. This is what makes the advice specific to you rather than generic."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Your buildings"
              action={
                <button
                  type="button"
                  onClick={addBuilding}
                  className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-xs"
                >
                  Add
                </button>
              }
            />
            <div className="space-y-4 p-4">
              {company.buildings.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Add a building to get advice about your own production rather than the market at large.
                </p>
              ) : (
                company.buildings.map((building, index) => (
                  <div key={index} className="space-y-2 rounded-md border border-[var(--border)] p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={building.label}
                        maxLength={60}
                        onChange={(event) => updateBuilding(index, { label: event.target.value })}
                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateCompany((c) => ({ ...c, buildings: c.buildings.filter((_, i) => i !== index) }))
                        }
                        aria-label={`Remove ${building.label}`}
                        className="rounded border border-[var(--border)] px-1.5 py-1 text-xs text-[var(--text-muted)]"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <SelectField
                        label="Type"
                        value={building.kind ?? ''}
                        onChange={(value) => updateBuilding(index, { kind: value || null, producingResourceId: null })}
                        options={catalog.buildings.map((b) => ({ value: b.kind, label: b.name }))}
                      />
                      <NumberField
                        label="Level"
                        value={building.level}
                        min={0}
                        max={1000}
                        onChange={(value) => updateBuilding(index, { level: value })}
                      />
                    </div>

                    <SelectField
                      label="Producing"
                      value={building.idle ? 'idle' : String(building.producingResourceId ?? '')}
                      onChange={(value) =>
                        updateBuilding(
                          index,
                          value === 'idle'
                            ? { idle: true, producingResourceId: null }
                            : { idle: false, producingResourceId: Number(value) },
                        )
                      }
                      options={[
                        { value: 'idle', label: 'Nothing (idle)' },
                        ...productsFor(building.kind).map((r) => ({ value: String(r.id), label: r.name })),
                      ]}
                    />
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Save and restore" description="Your data, in your hands." />
            <div className="space-y-3 p-4">
              <button
                type="button"
                onClick={exportJson}
                className="w-full rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm"
              >
                Copy my company as JSON
              </button>
              <label className="block">
                <span className="block text-xs font-medium text-[var(--text-muted)]">Paste a saved export</span>
                <textarea
                  rows={3}
                  placeholder='{"name": "...", "buildings": [...]}'
                  onChange={(event) => {
                    const text = event.target.value.trim();
                    if (text.length > 0) importJson(text);
                  }}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs"
                />
              </label>
              {importError ? <p className="text-xs text-[var(--danger)]">{importError}</p> : null}
              <button
                type="button"
                onClick={resetCompany}
                className="w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--danger)]"
              >
                Delete everything stored in this browser
              </button>
              {company.savedAt ? (
                <p className="text-xs text-[var(--text-faint)]">Saved locally {relativeTime(company.savedAt)}.</p>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {advice.recommendations.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing to report yet"
                description={
                  company.buildings.length === 0
                    ? 'Add your buildings and what each is producing. The advisor will then check them against current market prices.'
                    : 'Your buildings all look reasonable at current prices. That is the good outcome.'
                }
              />
            </Card>
          ) : (
            <>
              {advice.totalUpsidePerHour > 0 ? (
                <Card>
                  <div className="p-4 sm:p-5">
                    <p className="text-sm text-[var(--text-muted)]">Total identified impact</p>
                    <p className="tnum mt-1 text-2xl font-semibold text-[var(--up)]">
                      {money(advice.totalUpsidePerHour)}/hour
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">
                      The sum of every quantified finding below, at current prices. Acting on all of them is rarely
                      possible at once.
                    </p>
                  </div>
                </Card>
              ) : null}

              {advice.recommendations.map((recommendation) => (
                <Card key={recommendation.id} as="article">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text)]">{recommendation.title}</h3>
                      <Badge
                        tone={
                          recommendation.severity === 'critical'
                            ? 'danger'
                            : recommendation.severity === 'opportunity'
                              ? 'accent'
                              : 'neutral'
                        }
                      >
                        {recommendation.severity === 'critical'
                          ? 'Costing you money'
                          : recommendation.severity === 'opportunity'
                            ? 'Opportunity'
                            : 'Worth knowing'}
                      </Badge>
                    </div>

                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{recommendation.summary}</p>

                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                      {recommendation.evidence.map((item) => (
                        <div key={item.label}>
                          <dt className="text-[11px] text-[var(--text-faint)]">{item.label}</dt>
                          <dd className="tnum text-sm text-[var(--text)]">{item.value}</dd>
                        </div>
                      ))}
                    </dl>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-[var(--text-muted)]">What we assumed</summary>
                      <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-faint)]">
                        {recommendation.assumptions.map((assumption) => (
                          <li key={assumption}>· {assumption}</li>
                        ))}
                      </ul>
                    </details>

                    {recommendation.href ? (
                      <Link
                        href={recommendation.href}
                        className={clsx('mt-3 inline-block text-sm text-[var(--accent)] hover:underline')}
                      >
                        {recommendation.hrefLabel ?? 'Look into this'} →
                      </Link>
                    ) : null}
                  </div>
                </Card>
              ))}
            </>
          )}

          {advice.limitations.length > 0 ? (
            <Card>
              <div className="p-4 sm:p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                  What this advice does not cover
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-[var(--text-muted)]">
                  {advice.limitations.map((limitation) => (
                    <li key={limitation}>· {limitation}</li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}

          <p className="text-xs leading-relaxed text-[var(--text-faint)]">
            Advice is generated from fixed rules and current market prices — there is no black box and no AI guessing.
            Every figure above is reproducible from the numbers shown, and prices were observed{' '}
            {relativeTime(catalog.observedAt)}.
          </p>
        </div>
      </div>
    </div>
  );
}
