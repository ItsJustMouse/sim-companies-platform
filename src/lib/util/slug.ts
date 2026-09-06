/**
 * Converts a display name into a stable, URL-safe slug.
 *
 * Product URLs are a permanent, indexable surface, so this must stay deterministic:
 * changing it silently breaks every inbound link and every saved bookmark.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining marks so "Café" and "Cafe" agree.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
