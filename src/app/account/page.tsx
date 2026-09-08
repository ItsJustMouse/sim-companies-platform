import Link from 'next/link';
import { currentUser } from '@/lib/auth/session';
import { deleteAccount, signOut, signOutEverywhere } from '@/lib/auth/actions';
import { SignInForm } from '@/components/account/sign-in-form';
import { Card, CardHeader, Callout, SectionHeading } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';
import { absoluteTime } from '@/lib/util/format';

export const dynamic = 'force-dynamic';

const PUBLIC_BETA_ACCOUNTS_ENABLED: boolean = false;

export const metadata = buildMetadata({
  title: 'Accounts — coming later in the Public Beta',
  description: 'Ledgerforge accounts and server-side price alerts are not enabled in the v0.1 Public Beta yet.',
  path: '/account',
  index: false,
});

const SIGN_IN_ERRORS: Record<string, string> = {
  invalid: 'That sign-in link is not valid. It may have been mistyped, or it may belong to a different site.',
  expired: 'That sign-in link has expired. Links last 15 minutes — request a new one below.',
  used: 'That sign-in link has already been used. Links work exactly once, by design.',
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signedin?: string }>;
}) {
  if (!PUBLIC_BETA_ACCOUNTS_ENABLED) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <SectionHeading
          title="Accounts are coming later in the Public Beta"
          description="The v0.1 beta does not require an account."
        />
        <Card>
          <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
            <p>
              Accounts and server-side price alerts are still being tested and are not enabled for this release.
            </p>
            <p>
              The Exchange, market pages and public beta calculators work without signing in. Watchlists remain stored
              locally in this browser.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const [user, params] = await Promise.all([currentUser(), searchParams]);
  const signInError = params.error ? (SIGN_IN_ERRORS[params.error] ?? SIGN_IN_ERRORS['invalid']) : null;

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <SectionHeading
          title="Sign in"
          description="Optional. Every calculator, chart and price on this site works without an account."
        />

        {signInError ? <Callout tone="danger">{signInError}</Callout> : null}

        <Card>
          <div className="p-4 sm:p-5">
            <SignInForm />
          </div>
        </Card>

        <Card>
          <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
            <h2 className="mb-1.5 text-sm font-semibold text-[var(--text)]">What an account adds</h2>
            <p>
              Only the things that genuinely need a server: price alerts that fire while your browser is closed, and
              watchlists that follow you between devices. Watchlists already work without one — they live in this
              browser.
            </p>
            <p className="mt-2">
              An account here is entirely separate from your Sim Companies login. We never ask for that, and there is
              no mechanism by which we could use it.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SectionHeading title="Your account" description={user.email} />

      {params.signedin ? <Callout tone="info">You are signed in.</Callout> : null}

      <Card>
        <CardHeader title="Alerts" description="Get told when a price crosses a level you care about." />
        <div className="p-4 sm:p-5">
          <Link href="/account/alerts" className="text-sm text-[var(--accent)] hover:underline">
            Manage your alerts →
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader title="What we hold about you" />
        <div className="space-y-2 p-4 text-sm text-[var(--text-muted)] sm:p-5">
          <p>
            Your email address, the alerts you created, and a record of which alerts fired. Nothing else: no name, no
            profile, no tracking, and no Sim Companies credentials — the game provides no way for us to hold those,
            and we would not ask.
          </p>
          <p className="text-xs text-[var(--text-faint)]">Signed in as {user.email}. Last seen {absoluteTime(new Date().toISOString())}.</p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sessions" />
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <form action={signOut}>
            <button type="submit" className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-sm">
              Sign out
            </button>
          </form>
          <form action={signOutEverywhere}>
            <button type="submit" className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
              Sign out on every device
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Delete your account" />
        <div className="space-y-3 p-4 sm:p-5">
          <Callout tone="danger">
            This deletes your account, your alerts and your alert history immediately and permanently. There is no
            grace period and no recovery.
          </Callout>
          <form action={deleteAccount}>
            <button type="submit" className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]">
              Delete my account and everything in it
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
