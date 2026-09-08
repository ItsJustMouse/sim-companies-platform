import { getResources } from '@/lib/catalog/service';
import { DEFAULT_REALM_ID } from '@/lib/game/constants';

/**
 * Site-wide search.
 *
 * A small in-memory index rather than a search service: the corpus is a few hundred
 * products, buildings and static pages, which fits comfortably in memory and answers
 * in well under a millisecond. Adding Elasticsearch here would be cost and operational
 * burden with no user-visible benefit.
 */

export interface SearchHit {
  readonly kind: 'product' | 'building' | 'tool' | 'guide';
  readonly title: string;
  readonly href: string;
  readonly subtitle?: string;
  readonly score: number;
}

interface IndexEntry {
  kind: SearchHit['kind'];
  title: string;
  href: string;
  subtitle?: string;
  /** Extra terms that should match, e.g. synonyms and category names. */
  keywords: string[];
}

/** Static destinations. Products are added from the verified catalog at query time. */
const STATIC_ENTRIES: IndexEntry[] = [
  { kind: 'tool', title: 'Building ROI', href: '/calculators/investment', subtitle: 'Payback period and return on a build or upgrade', keywords: ['roi', 'payback', 'upgrade', 'construction', 'investment'] },
  { kind: 'tool', title: 'Break-even calculator', href: '/calculators/break-even', subtitle: 'Maximum input price and minimum sale price', keywords: ['break even', 'breakeven', 'minimum price', 'maximum price'] },
  { kind: 'tool', title: 'Loan and bond calculator', href: '/calculators/loan', subtitle: 'Cost of borrowing versus expected return', keywords: ['debt', 'bond', 'interest', 'borrow', 'loan'] },
  { kind: 'tool', title: 'Retail calculator', href: '/calculators/retail', subtitle: 'Retail margin, throughput and profit per hour', keywords: ['retail', 'store', 'shop', 'sell'] },
  { kind: 'tool', title: 'Quality calculator', href: '/calculators/quality', subtitle: 'Is higher quality worth the extra cost', keywords: ['quality', 'premium', 'q1', 'q2'] },
  { kind: 'tool', title: 'Capital allocation', href: '/calculators/allocation', subtitle: 'Compare where to put your money', keywords: ['allocation', 'compare', 'opportunity cost', 'capital'] },
  { kind: 'tool', title: 'Exchange', href: '/exchange', subtitle: 'Live prices, supply and movement for every product', keywords: ['prices', 'market', 'exchange', 'listings'] },
  { kind: 'guide', title: 'Beginner centre', href: '/learn', subtitle: 'Start here if the game is new to you', keywords: ['beginner', 'start', 'new', 'tutorial', 'how to play'] },
  { kind: 'guide', title: 'Glossary', href: '/learn/glossary', subtitle: 'Plain-language definitions of every term we use', keywords: ['glossary', 'definitions', 'terms', 'margin', 'roi'] },
  { kind: 'guide', title: 'Common beginner mistakes', href: '/learn/mistakes', subtitle: 'The expensive errors, and how to avoid them', keywords: ['mistakes', 'errors', 'avoid', 'wrong'] },
  { kind: 'guide', title: 'How profit is calculated', href: '/learn/profit', subtitle: 'Where every number in a profit figure comes from', keywords: ['profit', 'formula', 'calculation', 'wages', 'overhead'] },
  { kind: 'guide', title: 'Understanding opportunity cost', href: '/learn/opportunity-cost', subtitle: 'The most expensive thing beginners ignore', keywords: ['opportunity cost', 'alternative', 'trade off'] },
  { kind: 'guide', title: 'How we calculate', href: '/methodology', subtitle: 'Our formulas, sources and confidence levels', keywords: ['methodology', 'assumptions', 'sources', 'accuracy', 'formula'] },
  { kind: 'guide', title: 'Data status', href: '/status', subtitle: 'Upstream health, freshness and collection coverage', keywords: ['status', 'health', 'uptime', 'freshness', 'api'] },
];

/**
 * Scores a candidate against a query.
 *
 * Ranking favours, in order: exact title match, title prefix, title substring,
 * keyword hit, then a bounded edit-distance match that tolerates one or two typos on
 * longer words. Returns 0 when nothing matches.
 */
export function scoreEntry(entry: IndexEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;

  const title = entry.title.toLowerCase();
  if (title === q) return 1000;
  if (title.startsWith(q)) return 800 - title.length;
  if (title.includes(q)) return 600 - title.length;

  for (const keyword of entry.keywords) {
    const k = keyword.toLowerCase();
    if (k === q) return 500;
    if (k.startsWith(q)) return 420;
    if (k.includes(q)) return 340;
  }

  if (entry.subtitle?.toLowerCase().includes(q)) return 260;

  // Typo tolerance, only for queries long enough that a near-match is meaningful.
  if (q.length >= 4) {
    const words = title.split(/\s+/);
    for (const word of words) {
      const distance = boundedLevenshtein(word, q, 2);
      if (distance !== null && distance <= (q.length >= 7 ? 2 : 1)) return 200 - distance * 20;
    }
  }

  return 0;
}

/**
 * Levenshtein distance, abandoning early once it exceeds `max`.
 * The cap keeps this linear in practice and stops long unrelated words being compared
 * character by character for no reason.
 */
export function boundedLevenshtein(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  if (a === b) return 0;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return null;
    previous = current;
  }
  const result = previous[b.length] as number;
  return result > max ? null : result;
}

export async function search(query: string, limit = 12): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const realmId = DEFAULT_REALM_ID;
  const entries: IndexEntry[] = [...STATIC_ENTRIES];

  // Catalog entries come from the cached/stored catalog, so search stays available
  // even when the upstream is down.
  const { data: resources } = await getResources(realmId).catch(() => ({
    data: [] as Awaited<ReturnType<typeof getResources>>['data'],
  }));

  for (const resource of resources) {
    entries.push({
      kind: 'product',
      title: resource.name,
      href: `/exchange/${resource.slug}`,
      subtitle: resource.category ?? 'Product',
      keywords: [resource.category ?? '', 'price', 'chart', String(resource.id)].filter(Boolean),
    });
  }



  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, trimmed) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(({ entry, score }) => ({
      kind: entry.kind,
      title: entry.title,
      href: entry.href,
      ...(entry.subtitle === undefined ? {} : { subtitle: entry.subtitle }),
      score,
    }));
}

export const __testing = { STATIC_ENTRIES };
