import Link from 'next/link';
import type { ReactNode } from 'react';
import { CALCULATORS, calculatorBySlug } from '@/lib/calculators/catalog';
import { Card, Callout, SectionHeading } from '@/components/ui/primitives';
import { FreshnessLine } from '@/components/ui/freshness';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs } from '@/lib/seo';

/**
 * Shared frame for every calculator page: heading, data-freshness line, the tool
 * itself, and links to the calculators a reader is likely to need next.
 */
export function CalculatorShell({
  slug,
  children,
  observedAt,
  degraded,
}: {
  slug: string;
  children: ReactNode;
  observedAt?: string | null;
  degraded?: boolean;
}) {
  const entry = calculatorBySlug(slug);
  if (!entry) throw new Error(`Unknown calculator "${slug}"`);

  const related = entry.related
    .map((relatedSlug) => CALCULATORS.find((c) => c.slug === relatedSlug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="space-y-5">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Calculators', path: '/calculators' },
          { name: entry.title, path: `/calculators/${entry.slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
        <Link href="/calculators" className="hover:text-[var(--text)]">Calculators</Link>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text)]">{entry.title}</span>
      </nav>

      <SectionHeading
        title={entry.title}
        description={entry.question}
        action={entry.needsMarketData ? <FreshnessLine kind="derived" observedAt={observedAt ?? null} /> : undefined}
      />

      {entry.needsMarketData && degraded ? (
        <Callout tone="warn" title="No market prices available">
          This calculator normally fills in current prices for you. Nothing has been collected yet, so you will need to
          enter prices by hand — the maths is unaffected.
        </Callout>
      ) : null}

      {children}

      {related.length > 0 ? (
        <Card>
          <div className="p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Next question</h2>
            <ul className="mt-2 space-y-1.5">
              {related.map((relatedEntry) => (
                <li key={relatedEntry.slug}>
                  <Link href={`/calculators/${relatedEntry.slug}`} className="text-sm text-[var(--accent)] hover:underline">
                    {relatedEntry.question}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
