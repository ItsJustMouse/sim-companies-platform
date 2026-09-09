'use client';

import { useActionState, useState } from 'react';
import { createAlert, type AlertActionState } from '@/lib/alerts/actions';
import { QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS } from '@/lib/alerts/freshness';
import { Callout } from '@/components/ui/primitives';

const INITIAL: AlertActionState = { ok: false, message: '' };

interface Product {
  id: number;
  name: string;
}

const CONDITIONS = [
  { value: 'price_below', label: 'Price falls below', unit: '$', needsWindow: false },
  { value: 'price_above', label: 'Price rises above', unit: '$', needsWindow: false },
  { value: 'pct_change_up', label: 'Price rises by at least', unit: '%', needsWindow: true },
  { value: 'pct_change_down', label: 'Price falls by at least', unit: '%', needsWindow: true },
] as const;

export function AlertForm({ products, hasEmail }: { products: readonly Product[]; hasEmail: boolean }) {
  const [state, action, pending] = useActionState(createAlert, INITIAL);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]['value']>('price_below');
  const [channel, setChannel] = useState('none');
  const [quality, setQuality] = useState(0);

  const selected = CONDITIONS.find((c) => c.value === condition) ?? CONDITIONS[0];
  const qualityAlertMaxAgeHours = QUALITY_ALERT_MAX_SNAPSHOT_AGE_SECONDS / 3600;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="realmId" value={0} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Product</span>
          <select
            name="resourceId"
            required
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Quality</span>
          <select
            name="quality"
            value={quality}
            onChange={(event) => setQuality(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            {Array.from({ length: 13 }, (_, q) => (
              <option key={q} value={q}>
                {q === 0 ? 'Headline market price' : `Quality ${q}+`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">When</span>
          <select
            name="condition"
            value={condition}
            onChange={(event) => setCondition(event.target.value as typeof condition)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            {CONDITIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">
            Threshold <span className="text-[var(--text-faint)]">({selected.unit})</span>
          </span>
          <input
            type="number"
            name="threshold"
            required
            step="any"
            min={selected.unit === '%' ? 0.1 : 0}
            className="tnum mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          />
        </label>
      </div>

      {selected.needsWindow ? (
        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Measured over</span>
          <select
            name="windowHours"
            defaultValue="24"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
          </select>
        </label>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Notify me by</span>
          <select
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            <option value="none">Nothing — just record it here</option>
            <option value="discord">Discord webhook</option>
            <option value="email" disabled={!hasEmail}>
              Email{hasEmail ? '' : ' (not configured on this instance)'}
            </option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Do not repeat within</span>
          <select
            name="cooldownHours"
            defaultValue="6"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
          >
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
          </select>
        </label>
      </div>

      {channel === 'discord' ? (
        <label className="block">
          <span className="block text-xs font-medium text-[var(--text-muted)]">Discord webhook URL</span>
          <input
            type="url"
            name="destination"
            required
            maxLength={500}
            placeholder="https://discord.com/api/webhooks/…"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs"
          />
          <span className="mt-1 block text-xs text-[var(--text-faint)]">
            Only Discord webhook URLs are accepted. Anyone with this URL can post to that channel, so treat it as a
            secret.
          </span>
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Create alert'}
      </button>

      {state.message ? <Callout tone={state.ok ? 'info' : 'danger'}>{state.message}</Callout> : null}

      <p className="text-xs leading-relaxed text-[var(--text-faint)]">
        {quality === 0
          ? 'Headline alerts use Simconomist’s broad market ticker snapshots. They are checked against collected data rather than polling the game when an alert is evaluated.'
          : `Quality-specific alerts use selectively collected order-book snapshots. They will not fire from order-book data that is ${qualityAlertMaxAgeHours} hours old or older, so an alert may wait for fresh depth data before it can trigger.`}
      </p>
    </form>
  );
}
