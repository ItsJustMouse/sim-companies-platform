import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { collectHealth } from '@/lib/admin/health';
import { Card, CardHeader, Badge, Callout, SectionHeading, Stat } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';
import { absoluteTime, compactNumber, number, relativeTime } from '@/lib/util/format';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Admin',
  description: 'Operational dashboard.',
  path: '/admin',
  index: false,
});

/** Clock reads live outside the component so rendering stays pure. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : (Date.now() - parsed) / 60_000;
}

/**
 * Administrator dashboard.
 *
 * Access is decided by `ADMIN_EMAILS`, deliberately configuration rather than a
 * database column: a write to the users table can then never grant administrator
 * rights, so an SQL-injection or IDOR bug elsewhere cannot escalate to one.
 *
 * The page is read-only. Operational changes go through explicit tools rather than
 * a button on a dashboard, so there is no state-changing surface to defend here.
 */
export default async function AdminPage() {
  const user = await currentUser();
  // Redirect rather than a 403 page: an unauthenticated visitor should not learn
  // that this path exists at all.
  if (!user?.isAdmin) redirect('/');

  const health = await collectHealth();
  const snapshotAge = minutesSince(health.collection.latestSnapshotAt);

  const failedJobs = health.jobs.filter((job) => job.status === 'failed');

  return (
    <div className="space-y-5">
      <SectionHeading title="System health" description={`Signed in as ${user.email}`} />

      {health.fixtureData ? (
        <Callout tone="danger" title="This instance is serving fixture data">
          The database contains synthetic development data. Running a real catalog sync or market snapshot clears this
          automatically.
        </Callout>
      ) : null}

      {snapshotAge !== null && snapshotAge > 60 ? (
        <Callout tone="warn" title="Collection may have stopped">
          The most recent market snapshot is {Math.round(snapshotAge)} minutes old. Check that the worker is running.
        </Callout>
      ) : null}

      {failedJobs.length > 0 ? (
        <Callout tone="danger" title={`${failedJobs.length} recent job failures`}>
          {failedJobs[0]?.job}: {failedJobs[0]?.error?.slice(0, 200)}
        </Callout>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Database" />
          <div className="p-4">
            <Badge tone={health.database.ok ? 'up' : 'danger'}>{health.database.ok ? 'Connected' : 'Unreachable'}</Badge>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {health.database.latencyMs !== null ? `${health.database.latencyMs} ms round trip` : health.database.detail}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cache" />
          <div className="p-4">
            <Badge tone={health.cache.ok ? 'up' : 'warn'}>{health.cache.backend}</Badge>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {health.cache.ok ? 'Responding' : (health.cache.detail ?? 'Not responding')}
              {typeof health.cache.entries === 'number' ? ` · ${health.cache.entries} entries` : ''}
            </p>
            {health.cache.backend === 'memory' ? (
              <p className="mt-1 text-xs text-[var(--text-faint)]">
                In-process cache: correct for one instance, but shares nothing between replicas.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Game API" />
          <div className="p-4">
            <Badge
              tone={
                !health.upstream.enabled
                  ? 'neutral'
                  : health.upstream.circuit.state === 'closed'
                    ? 'up'
                    : 'danger'
              }
            >
              {!health.upstream.enabled ? 'Disabled' : `Circuit ${health.upstream.circuit.state}`}
            </Badge>
            <dl className="mt-2 space-y-0.5 text-sm text-[var(--text-muted)]">
              <Row label="Requests" value={number(health.upstream.requests)} />
              <Row label="Failures" value={number(health.upstream.failures)} />
              <Row label="Retries" value={number(health.upstream.retries)} />
              <Row label="Coalesced" value={number(health.upstream.coalesced)} />
              <Row
                label="Avg latency"
                value={health.upstream.averageLatencyMs === null ? '—' : `${health.upstream.averageLatencyMs} ms`}
              />
              <Row label="Last success" value={relativeTime(health.upstream.lastSuccessAt)} />
            </dl>
            {health.upstream.lastErrorMessage ? (
              <p className="mt-2 text-xs text-[var(--danger)]">{health.upstream.lastErrorMessage.slice(0, 160)}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Market collection" />
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-3 lg:grid-cols-6 sm:p-5">
          <Stat label="Products" value={number(health.collection.resourceCount)} />
          <Stat label="Snapshots" value={compactNumber(health.collection.snapshotCount)} />
          <Stat label="Candles" value={compactNumber(health.collection.candleCount)} />
          <Stat
            label="Last snapshot"
            value={relativeTime(health.collection.latestSnapshotAt)}
            tone={snapshotAge !== null && snapshotAge > 60 ? 'warn' : 'neutral'}
          />
          <Stat
            label="History since"
            value={
              health.collection.oldestSnapshotAt
                ? health.collection.oldestSnapshotAt.slice(0, 10)
                : '—'
            }
          />
          <Stat
            label="Stale products"
            value={number(health.collection.staleProducts)}
            tone={health.collection.staleProducts > 0 ? 'warn' : 'neutral'}
            hint="No snapshot in 24h"
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Accounts and alerts" />
        <div className="grid grid-cols-2 gap-5 p-4 sm:grid-cols-4 sm:p-5">
          <Stat label="Users" value={number(health.accounts.users)} />
          <Stat label="Alerts" value={number(health.accounts.alerts)} />
          <Stat label="Active alerts" value={number(health.accounts.activeAlerts)} />
          <Stat label="Fired (24h)" value={number(health.accounts.alertEvents24h)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Recent jobs" description="Most recent 25 background job runs." />
        {health.jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--text-muted)]">No jobs have run yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Recent background job runs</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th scope="col" className="px-4 py-2 font-medium">Job</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Items</th>
                  <th scope="col" className="px-4 py-2 font-medium">Started</th>
                  <th scope="col" className="px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {health.jobs.map((job, index) => (
                  <tr key={`${job.job}-${index}`} className="border-b border-[var(--border)] last:border-0">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">{job.job}</th>
                    <td className="px-4 py-1.5">
                      <Badge tone={job.status === 'ok' ? 'up' : job.status === 'failed' ? 'danger' : 'neutral'}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="tnum px-4 py-1.5 text-right text-[var(--text-muted)]">
                      {compactNumber(job.itemsProcessed)}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-[var(--text-muted)]" title={absoluteTime(job.startedAt)}>
                      {relativeTime(job.startedAt)}
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-1.5 text-xs text-[var(--danger)]">
                      {job.error ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tnum text-[var(--text)]">{value}</dd>
    </div>
  );
}
