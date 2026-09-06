/**
 * CSV serialisation.
 *
 * The important part is `escapeCell`. A cell beginning with `=`, `+`, `-` or `@` is
 * interpreted as a formula by Excel, Google Sheets and LibreOffice — so an exported
 * value can execute when someone opens the file. Our own exports are numbers and
 * product names, but the same helper serialises user-supplied watchlist notes, and a
 * CSV writer that is only safe for trusted input is a bug waiting to be filed.
 *
 * The mitigation is to prefix such cells with a single quote, which the spreadsheet
 * strips on display and never evaluates.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  // Numbers are emitted bare: they cannot be formulas, and quoting them makes some
  // spreadsheets treat the column as text.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;

  // Quote whenever the cell contains a delimiter, quote or newline; double any
  // embedded quotes, per RFC 4180.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: readonly Record<string, unknown>[], columns?: readonly string[]): string {
  if (rows.length === 0) return columns ? `${columns.join(',')}\n` : '';

  const headers = columns ?? Object.keys(rows[0] as Record<string, unknown>);
  const lines = [headers.map(escapeCell).join(',')];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  }

  // CRLF, which is what RFC 4180 specifies and what Excel expects.
  return `${lines.join('\r\n')}\r\n`;
}
