/**
 * Structured data.
 *
 * The payload is serialised with `<` escaped so a value containing markup cannot
 * break out of the script element — the standard XSS vector for JSON-LD.
 */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
