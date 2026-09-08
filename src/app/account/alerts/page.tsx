import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { deleteAlert, listAlertHistory, listAlerts, toggleAlert } from '@/lib/alerts/actions';
import { getResources } from '@/lib/catalog/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';
import { env } from '@/lib/env';
import { AlertForm } from '@/components/account/alert-form';
import { Card, CardHeader, Badge, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';
import { absoluteTime, relativeTime } from '@/lib/util/format';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Your alerts',
  description: 'Manage your Sim Companies price alerts.',
  path: '/account/alerts',
  index: false,
});

const CONDITION_LABELS: Record<string, string> = {
  price_below: 'falls below',
  price_above: 'rises above',
  pct_change_up: 'rises by at least',
  pct_change_down: 'falls by at least',
};

export default async function AlertsPage() {
  const publicBetaAccountsEnabled: boolean = false;
  if (!publicBetaAccountsEnabled) redirect('/account');

  const user = await currentUser();
  if (!user) redirect('/account');

  const [alerts, history, { data: resources }] = await Promise.all([
    listAlerts(user.id),
    listAlertHistory(user.id),
    getResources(DEFAULT_REALM_ID),
  ]);

  const nameById = new Map(resources.map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
        <Link href="/account" className="hover:text-[var(--text)]">Account</Link>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text)]">Alerts</span>
      </nav>

      <SectionHeading title="Price alerts" description="Told when a price crosses a level you care about." />

      <Card>
        <CardHeader title="New alert" />
        <div className="p-4 sm:p-5">
          <AlertForm
            products={resources.map((r) => ({ id: r.id, name: r.name }))}
            hasEmail={Boolean(env().SMTP_URL)}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={`Your alerts (${alerts.length})`} />
        {alerts.length === 0 ? (
          <EmptyState title="No alerts yet" description="Create one above and it will be checked automatically against the market observations Ledgerforge has collected." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{nameById.get(alert.resourceId) ?? `Product ${alert.resourceId}`}</span>
                    {alert.quality > 0 ? <span className="text-[var(--text-faint)]"> (Q{alert.quality}+)</span> : null}
                    <span className="text-[var(--text-muted)]">
                      {' '}
                      {CONDITION_LABELS[alert.condition] ?? alert.condition}{' '}
                    </span>
                    <span className="tnum font-medium">
                      {alert.condition.startsWith('pct') ? `${alert.threshold}%` : `$${alert.threshold}`}
                    </span>
                    {alert.windowHours ? (
                      <span className="text-[var(--text-muted)]"> over {alert.windowHours}h</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-faint)]">
                    via {alert.channel === 'none' ? 'this page only' : alert.channel} · quiet for{' '}
                    {Math.round(alert.cooldownSeconds / 3600)}h after firing ·{' '}
                    {alert.lastFiredAt ? `last fired ${relativeTime(alert.lastFiredAt.toISOString())}` : 'never fired'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {alert.enabled ? <Badge tone="up">Active</Badge> : <Badge>Paused</Badge>}
                  <form action={toggleAlert}>
                    <input type="hidden" name="id" value={alert.id} />
                    <input type="hidden" name="enabled" value={String(!alert.enabled)} />
                    <button type="submit" className="rounded border border-[var(--border)] px-2 py-1 text-xs">
                      {alert.enabled ? 'Pause' : 'Resume'}
                    </button>
                  </form>
                  <form action={deleteAlert}>
                    <input type="hidden" name="id" value={alert.id} />
                    <button type="submit" className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--danger)]">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Alert history" description="Every time one of your alerts fired, and whether it reached you." />
        {history.length === 0 ? (
          <EmptyState title="Nothing has fired yet" description="Alerts that trigger will be recorded here even if delivery fails." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {history.map((event) => (
              <li key={event.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-sm text-[var(--text-muted)]">{event.message}</p>
                  <Badge tone={event.status === 'sent' ? 'up' : event.status === 'failed' ? 'danger' : 'neutral'}>
                    {event.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-faint)]" title={absoluteTime(event.firedAt.toISOString())}>
                  {relativeTime(event.firedAt.toISOString())}
                  {event.detail ? ` · ${event.detail}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
