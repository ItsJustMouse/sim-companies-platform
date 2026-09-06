import Link from 'next/link';
import { Card, CardHeader, Callout } from '@/components/ui/primitives';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Terms of use',
  description: 'The terms on which Ledgerforge is provided.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Terms of use</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">
          Plain-language terms for a free tool.
        </p>
      </div>

      <Callout tone="info" title="Draft, not legal advice">
        This is a working document written by the project, not a lawyer-reviewed contract.
      </Callout>

      <Card>
        <CardHeader title="No affiliation" />
        <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Ledgerforge is an independent, unofficial tool. It is not affiliated with, endorsed by, sponsored by or
            operated by the makers of Sim Companies. All game names, marks and content belong to their respective
            owners and appear here only to identify the game this tool supports.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="No warranty on the numbers" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Everything here is provided as-is. Prices are observations of a third-party API that may be delayed,
            incomplete or wrong. Game mechanics are inferred where they are not published, and we label our confidence
            accordingly on{' '}
            <Link href="/methodology" className="text-[var(--accent)] underline underline-offset-2">
              the methodology page
            </Link>
            .
          </p>
          <p>
            Every projection is an estimate based on prices at a stated moment, not a prediction and not a guarantee of
            in-game results. Decisions you make with these figures are yours.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fair use" />
        <div className="space-y-3 p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            Use the site normally and it is free. Please do not scrape it aggressively, attempt to circumvent its rate
            limits, or use it in ways that would put load on the game&rsquo;s servers — the collection design exists
            specifically to keep that footprint small, and abusing it risks access for everyone.
          </p>
          <p>
            Nothing here is intended to help break Sim Companies&rsquo; own rules. We do not automate gameplay, and we
            will not add features that do.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Availability" />
        <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <p>
            This is a free tool with no uptime commitment. It may be unavailable, may lose collected history, and may
            change or stop. Anything you would be upset to lose should be exported and kept by you.
          </p>
        </div>
      </Card>
    </div>
  );
}
