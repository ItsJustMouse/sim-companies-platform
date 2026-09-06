import type { ReactNode } from 'react';

/**
 * Renders guide body text.
 *
 * Guide paragraphs support a single inline convention: **bold** for the term being
 * defined. It is parsed here rather than by a markdown library because that is the
 * only markup the content uses, and a full markdown pipeline would mean shipping a
 * parser and defending it against its own input for one feature.
 */
export function Paragraph({ text }: { text: string }) {
  return <p className="mb-3 leading-relaxed text-[var(--text-muted)] last:mb-0">{renderInline(text)}</p>;
}

function renderInline(text: string): ReactNode[] {
  // Split on **bold** spans, keeping the delimiters' contents.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-[var(--text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/** Monospaced worked example. Preserves alignment, scrolls rather than wrapping. */
export function Example({ title, lines }: { title: string; lines: readonly string[] }) {
  return (
    <figure className="my-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-muted)]">
      <figcaption className="border-b border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)]">
        {title}
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="tnum px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--text)]">
          {lines.join('\n')}
        </pre>
      </div>
    </figure>
  );
}
