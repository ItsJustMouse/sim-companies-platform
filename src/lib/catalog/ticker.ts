import type { Resource } from '@/lib/game/types';
import type { MarketTickerEntry } from '@/lib/upstream/normalise';

const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  'icecream-chocolate': 'Chocolate Ice Cream',
  'icecream-apple': 'Apple Ice Cream',
  'economy-e-car': 'Economy E-Car',
  'luxury-e-car': 'Luxury E-Car',
  'on-board-computer': 'On-board Computer',
  'high-grade-e-components': 'High Grade E-Components',
};

export function resourceStubFromTicker(entry: MarketTickerEntry): Resource {
  const slug = slugFromTickerImage(entry.image, entry.resourceId);

  return {
    id: entry.resourceId,
    name: displayNameFromSlug(slug),
    slug,
    image: entry.image,
    transportUnits: null,
    baseUnitsPerHour: null,
    retailable: null,
    isResearch: null,
    category: null,
  };
}

export function slugFromTickerImage(
  image: string | null,
  resourceId: number,
): string {
  if (!image) return `resource-${resourceId}`;

  const filename = image.split('/').pop();
  if (!filename) return `resource-${resourceId}`;

  const slug = filename.replace(/\.[^.]+$/, '').trim();
  return slug || `resource-${resourceId}`;
}

export function displayNameFromSlug(slug: string): string {
  const override = DISPLAY_NAME_OVERRIDES[slug];
  if (override) return override;

  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => {
      if (part === 'xmas') return 'Xmas';
      if (part === 'e') return 'E';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}
