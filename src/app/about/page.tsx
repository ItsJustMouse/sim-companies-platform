import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'About Ledgerforge',
  description:
    'Ledgerforge is an independent, unofficial Sim Companies companion for market observations, price history, analytics and transparent planning calculators.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">About Ledgerforge</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
          An independent companion for Sim Companies players who want clearer market information and transparent
          planning tools — built by a player, for players, and not affiliated with the game in any way.
        </p>
      </div>

      <Card>
        <CardHeader title="What it is for" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Sim Companies decisions often involve several prices, assumptions and calculations spread across multiple
            screens. Ledgerforge brings useful market observations and planning tools together and shows the assumptions
            behind its calculations so you can check them rather than blindly trust them.
          </p>
          <p>
            During the public beta, Ledgerforge focuses on recording exchange prices over time, building its own price
            history, highlighting market movement and providing transparent calculators for investment, borrowing
            and capital-comparison decisions.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="The principles it is built on" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            <strong className="text-[var(--text)]">No invented data.</strong> If a price is unknown it shows as a dash,
            never a zero. If a mechanic is not published, we say we inferred it and rate our confidence.
          </p>
          <p>
            <strong className="text-[var(--text)]">Every number is checkable.</strong> Each calculation carries its
            formula, its inputs and its assumptions. There is no black box, and no AI making things up.
          </p>
          <p>
            <strong className="text-[var(--text)]">Light on the game&rsquo;s servers.</strong> One collector serves the
            whole site, so however many people are reading a product page, the game sees at most one request for it per
            cycle.
          </p>
          <p>
            <strong className="text-[var(--text)]">Minimal data about you.</strong> The v0.1 Public Beta needs no
            account. Watchlists and any local workspace data stay in your browser. We never ask for your Sim Companies
            login.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Independence" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Ledgerforge is not affiliated with, endorsed by, or operated by the makers of Sim Companies. It is an
            independent third-party tool. &ldquo;Sim Companies&rdquo; and all related names, marks and game content
            belong to their respective owners and are used here only to identify the game this tool supports.
          </p>
          <p>
            Game data is read from publicly accessible game endpoints that are undocumented and unsupported. We keep
            our request rate low and identify ourselves in every request. If the operators would prefer we did something
            differently, we would rather hear it than be blocked.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Cost and monetisation" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Free, and the tools are not going behind a paywall. There is no advertising and no tracking. If hosting
            costs eventually need covering, that will be by optional support rather than by taking away something that
            already worked.
          </p>
          <p>
            See{' '}
            <Link href="/methodology" className="text-[var(--accent)] underline underline-offset-2">
              how we calculate
            </Link>{' '}
            and{' '}
            <Link href="/status" className="text-[var(--accent)] underline underline-offset-2">
              data status
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}
