import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, guideBySlug } from '@/lib/content/guides';
import { Card, Callout } from '@/components/ui/primitives';
import { Example, Paragraph } from '@/components/ui/prose';
import { JsonLd } from '@/components/ui/json-ld';
import { breadcrumbs, buildMetadata, siteUrl } from '@/lib/seo';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  // Guides are static content with no data dependency, so they are prerendered.
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) {
    return buildMetadata({ title: 'Guide not found', description: '', path: `/learn/${slug}`, index: false });
  }
  return buildMetadata({
    title: guide.title,
    description: guide.description,
    path: `/learn/${guide.slug}`,
    type: 'article',
  });
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const related = guide.related
    .map((relatedSlug) => guideBySlug(relatedSlug))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <JsonLd
        data={breadcrumbs([
          { name: 'Home', path: '/' },
          { name: 'Learn', path: '/learn' },
          { name: guide.title, path: `/learn/${guide.slug}` },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: guide.title,
          description: guide.description,
          url: siteUrl(`/learn/${guide.slug}`),
          author: { '@type': 'Organization', name: 'Ledgerforge' },
          publisher: { '@type': 'Organization', name: 'Ledgerforge' },
        }}
      />

      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-muted)]">
        <Link href="/learn" className="hover:text-[var(--text)]">Learn</Link>
        <span className="mx-1.5 text-[var(--text-faint)]">/</span>
        <span className="text-[var(--text)]">{guide.title}</span>
      </nav>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{guide.title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--text-muted)]">{guide.summary}</p>
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          {guide.level} · {guide.minutes} min read
        </p>
      </header>

      <article className="space-y-7">
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="mb-2 text-lg font-semibold tracking-tight text-[var(--text)]">{section.heading}</h2>
            {section.body.map((paragraph, index) => (
              <Paragraph key={index} text={paragraph} />
            ))}
            {section.example ? <Example title={section.example.title} lines={section.example.lines} /> : null}
            {section.warning ? (
              <div className="mt-3">
                <Callout tone="warn">{section.warning}</Callout>
              </div>
            ) : null}
          </section>
        ))}
      </article>

      {guide.tools.length > 0 ? (
        <Card>
          <div className="p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Try it now</h2>
            <ul className="mt-2 space-y-1.5">
              {guide.tools.map((tool) => (
                <li key={tool.href}>
                  <Link href={tool.href} className="text-sm text-[var(--accent)] hover:underline">
                    {tool.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {related.length > 0 ? (
        <Card>
          <div className="p-4 sm:p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Read next</h2>
            <ul className="mt-2 space-y-1.5">
              {related.map((relatedGuide) => (
                <li key={relatedGuide.slug}>
                  <Link href={`/learn/${relatedGuide.slug}`} className="text-sm text-[var(--accent)] hover:underline">
                    {relatedGuide.title}
                  </Link>
                  <span className="ml-2 text-xs text-[var(--text-faint)]">{relatedGuide.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
