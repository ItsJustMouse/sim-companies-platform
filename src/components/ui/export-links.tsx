/**
 * Download links for the data on the current page.
 *
 * Plain anchors rather than a scripted download: the endpoint sets
 * Content-Disposition, so the browser handles it natively, it works without
 * JavaScript, and the URL is inspectable and shareable.
 */
export function ExportLinks({
  dataset,
  params,
  label = 'Export',
}: {
  dataset: 'market' | 'history' | 'opportunities';
  params?: Record<string, string | number>;
  label?: string;
}) {
  const build = (format: 'csv' | 'json') => {
    const search = new URLSearchParams({ dataset, format });
    for (const [key, value] of Object.entries(params ?? {})) search.set(key, String(value));
    return `/api/export?${search.toString()}`;
  };

  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span>{label}:</span>
      <a href={build('csv')} className="text-[var(--accent)] hover:underline" download>
        CSV
      </a>
      <a href={build('json')} className="text-[var(--accent)] hover:underline" download>
        JSON
      </a>
    </span>
  );
}
