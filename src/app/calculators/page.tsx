import Link from 'next/link';
import { BETA_CALCULATORS, CALCULATOR_GROUPS } from '@/lib/calculators/catalog';
import { Card, SectionHeading } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Sim Companies calculators',
  description:
    'Building ROI, loan and capital comparison calculators for Sim Companies — each one showing its formula and assumptions.',
  path: '/calculators',
});

export default function CalculatorsPage() {
  return (
    <div className="space-y-6">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Calculators', path: '/calculators' },
        ])}
      />

      <SectionHeading
        title="Calculators"
        description="Each one answers a specific question and shows the formula, the inputs and the assumptions behind its answer."
      />

      {CALCULATOR_GROUPS.map((group) => {
        const entries = BETA_CALCULATORS.filter((entry) => entry.group === group);
        if (entries.length === 0) return null;

        return (
          <section key={group}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--text-faint)]">{group}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {entries.map((entry) => (
                <Card key={entry.slug} as="article">
                  <Link href={`/calculators/${entry.slug}`} className="block p-4 hover:bg-[var(--surface-muted)]">
                    <h3 className="text-sm font-semibold text-[var(--text)]">{entry.title}</h3>
                    <p className="mt-1 text-sm font-medium text-[var(--accent)]">{entry.question}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">{entry.description}</p>
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <Card>
        <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <h2 className="mb-1.5 text-sm font-semibold text-[var(--text)]">About these numbers</h2>
          <p>
            Every calculator uses one shared engine, so a figure means the same thing wherever it appears. Each result
            carries its formula, the inputs that produced it, and the confidence we have in the underlying game
            mechanic — the game&rsquo;s operators publish no specification, so anything we have inferred is labelled as
            inferred. See{' '}
            <Link href="/methodology" className="text-[var(--accent)] underline underline-offset-2">
              how we calculate
            </Link>{' '}
            for the full list.
          </p>
        </div>
      </Card>
    </div>
  );
}
