import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Privacy',
  description: 'What Ledgerforge stores, what it does not, and how to remove everything.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Privacy</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
          The short version: you can use almost all of this site without giving us anything, and the parts that do need
          data need very little.
        </p>
      </div>

      <Callout tone="info" title="This is a plain-language notice, not a lawyer-reviewed policy">
        It describes what the software actually does, which we think is more useful than a document written to be
        unfalsifiable. It has not been reviewed by a solicitor.
      </Callout>

      <Card>
        <CardHeader title="Without an account" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>We store nothing about you on our servers. Specifically:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Your watchlist is in your browser&rsquo;s local storage, not our database.</li>
            <li>Your company workspace, and the advice generated from it, is in your browser and computed there.</li>
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
        <CardHeader title="With an account" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>An account exists only to make alerts work while your browser is closed. We store:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Your email address.</li>
            <li>The alerts you create, and a record of when they fired and whether delivery succeeded.</li>
            <li>A hash of your session token — never the token itself, so a database leak yields no usable sessions.</li>
            <li>A Discord webhook URL, if you supply one, encrypted at rest.</li>
          </ul>
          <p>
            We do not store passwords, because there are none: sign-in is by emailed link. We do not ask for a name, and
            we do not build a profile.
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
            Ledgerforge will never require your Sim Companies password or session cookie for company analysis. Any
            company data you choose to use with Ledgerforge should be entered by you and kept under your control.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Cookies" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            One, and only if you sign in: a session cookie that keeps you signed in. It is HttpOnly, SameSite=Lax and
            Secure. There are no advertising or analytics cookies, which is why this site has no cookie banner — there
            is nothing to consent to.
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
            they have been aggregated. Sessions expire and are deleted. Login links expire after 15 minutes.
          </p>
        </div>
      </Card>
    </div>
  );
}
