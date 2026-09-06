import Link from 'next/link';
import { GUIDES, GUIDE_LEVELS } from '@/lib/content/guides';
import { Card, SectionHeading } from '@/components/ui/primitives';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Sim Companies beginner guides',
  description:
    'Learn Sim Companies from scratch: how the game makes money, what production really costs, opportunity cost, margins and ROI, reading the exchange, and the mistakes that cost new players most.',
  path: '/learn',
});

export default function LearnPage() {
  return (
    <div className="space-y-6">
      <JsonLd data={breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Learn', path: '/learn' }])} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Learn the game</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-[var(--text-muted)]">
          Written for someone who has never calculated a margin. Each guide explains one idea in plain language, shows
          a worked example, and links to a tool that lets you apply it to your own company straight away.
        </p>
      </div>

      {GUIDE_LEVELS.map((level) => {
        const guides = GUIDES.filter((guide) => guide.level === level);
        if (guides.length === 0) return null;

        return (
          <section key={level}>
            <SectionHeading title={level} />
            <div className="grid gap-3 md:grid-cols-2">
              {guides.map((guide) => (
                <Card key={guide.slug} as="article">
                  <Link href={`/learn/${guide.slug}`} className="block p-4 hover:bg-[var(--surface-muted)]">
                    <h3 className="text-sm font-semibold text-[var(--text)]">{guide.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{guide.summary}</p>
                    <p className="mt-2 text-xs text-[var(--text-faint)]">{guide.minutes} min read</p>
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <Card>
        <div className="p-4 text-sm leading-relaxed text-[var(--text-muted)] sm:p-5">
          <h2 className="mb-1.5 text-sm font-semibold text-[var(--text)]">Looking for the official reference?</h2>
          <p>
            These guides are our own writing, aimed at explaining the economics rather than documenting the game. For
            the game&rsquo;s own reference material — mechanics, item data and update notes — the official Sim
            Companies wiki and in-game encyclopedia are the authority, and we link to them from the relevant pages.
          </p>
        </div>
      </Card>
    </div>
  );
}
