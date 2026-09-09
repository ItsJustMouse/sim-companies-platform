import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Privacy',
  description: 'What Simconomist stores, what it does not, and how to remove everything.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Privacy</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
          The short version: the v0.1 Public Beta does not require an account, and the public tools need very little
          information about you.
        </p>
      </div>

      <Callout tone="info" title="This is a plain-language notice, not a lawyer-reviewed policy">
        It describes what the software actually does, which we think is more useful than a document written to be
        unfalsifiable. It has not been reviewed by a solicitor.
      </Callout>

      <Card>
        <CardHeader title="Data stored by the v0.1 Public Beta" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>We store nothing about you on our servers. Specifically:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Your watchlist is in your browser&rsquo;s local storage, not our database.</li>
            <li>Any local workspace data you choose to enter stays in your browser and is computed there.</li>
            <li>Your theme choice is in your browser.</li>
            <li>There is no analytics script, no advertising and no third-party tracker on any page.</li>
          </ul>
          <p>
            Our servers keep ordinary web logs to run the service and diagnose faults. They do not carry a per-visitor
            identifier, and aggregate usage counters record only which pages and tools are used, never by whom.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Accounts and alerts" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Accounts and server-side alerts are not enabled in the v0.1 Public Beta. The public beta therefore does not
            ask for or accept an account email address, create login sessions, or deliver account alerts.
          </p>
          <p>
            The underlying account and alert features are still being tested and will receive their own privacy review
            before they are exposed publicly.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Your Sim Companies account" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            We never ask for it, and we could not use it if you offered. Sim Companies provides no way for a
            third-party site to be authorised on your behalf — no OAuth, no API tokens — so the only way a site could
            read your private company data is by holding your game login.
          </p>
          <p>
            We will not do that. Any site that asks for your Sim Companies password or session cookie is asking for
            full control of your account, and you should decline.
          </p>
          <p>
            Simconomist will never require your Sim Companies password or session cookie for company analysis. Any
            company data you choose to use with Simconomist should be entered by you and kept under your control.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Cookies" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            The v0.1 Public Beta does not use an account session cookie because sign-in is disabled. There are no
            advertising or analytics cookies and no third-party advertising tracker.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Removing your data" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-[var(--text)]">Browser data</strong> — clear it from the company page, or clear
              site data in your browser. Nothing was sent to us.
            </li>
            <li>
              <strong className="text-[var(--text)]">Accounts</strong> — accounts and server-side alerts are not enabled
              in the v0.1 Public Beta.
            </li>
            <li>
              <strong className="text-[var(--text)]">Export</strong> — your company workspace can be copied out as JSON
              at any time; it is your data and it is already on your machine.
            </li>
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader title="Retention" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Market observations are about products, not people, and are kept indefinitely in aggregated form because
            they are the price history the site exists to provide. Detailed snapshots are pruned after a few weeks once
            they have been aggregated. Account sessions and login links are not part of the exposed v0.1 Public Beta.
          </p>
        </div>
      </Card>
    </div>
  );
}
