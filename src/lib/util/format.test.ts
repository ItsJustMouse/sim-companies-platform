import { describe, expect, it } from 'vitest';
import { compactNumber, duration, money, percent, ratioAsPercent, relativeTime, UNKNOWN } from './format';

describe('money', () => {
  it('renders unknown values as a dash, never as zero', () => {
    expect(money(null)).toBe(UNKNOWN);
    expect(money(undefined)).toBe(UNKNOWN);
    expect(money(Number.NaN)).toBe(UNKNOWN);
    expect(money(Number.POSITIVE_INFINITY)).toBe(UNKNOWN);
  });

  it('distinguishes a real zero from an unknown value', () => {
    expect(money(0)).toBe('$0.0000');
  });

  it('scales precision to magnitude so cheap goods keep their detail', () => {
    expect(money(0.0191)).toBe('$0.0191');
    expect(money(3.5)).toBe('$3.500');
    expect(money(42.5)).toBe('$42.50');
    expect(money(1500)).toBe('$1,500');
  });

  it('compacts large values on request', () => {
    expect(money(2_500_000, { compact: true })).toBe('$2.50M');
  });

  it('formats negatives', () => {
    expect(money(-12.5)).toBe('$-12.50');
  });
});

describe('compactNumber', () => {
  it('abbreviates by magnitude', () => {
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(12_400)).toBe('12.4K');
    expect(compactNumber(3_200_000)).toBe('3.20M');
    expect(compactNumber(7_100_000_000)).toBe('7.10B');
  });

  it('reports unknowns as a dash', () => {
    expect(compactNumber(null)).toBe(UNKNOWN);
  });
});

describe('percent', () => {
  it('always shows a sign so direction is unambiguous', () => {
    expect(percent(4.5)).toBe('+4.50%');
    expect(percent(-4.5)).toBe('-4.50%');
    expect(percent(0)).toBe('+0.00%');
  });

  it('renders unknown as a dash', () => {
    expect(percent(null)).toBe(UNKNOWN);
  });
});

describe('ratioAsPercent', () => {
  it('converts a fraction without forcing a sign', () => {
    expect(ratioAsPercent(0.153)).toBe('15.3%');
    expect(ratioAsPercent(null)).toBe(UNKNOWN);
  });
});

describe('duration', () => {
  it('picks a readable unit', () => {
    expect(duration(0.5)).toBe('30 min');
    expect(duration(6)).toBe('6.0 h');
    expect(duration(120)).toBe('5.0 days');
    expect(duration(24 * 90)).toBe('3.0 months');
  });

  it('rejects impossible durations', () => {
    expect(duration(-1)).toBe(UNKNOWN);
    expect(duration(null)).toBe(UNKNOWN);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-03-01T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('describes recency in human terms', () => {
    expect(relativeTime(ago(10_000), now)).toBe('just now');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('2 days ago');
    expect(relativeTime(ago(86_400_000), now)).toBe('1 day ago');
  });

  it('handles missing and malformed timestamps distinctly', () => {
    expect(relativeTime(null, now)).toBe('never');
    expect(relativeTime('not-a-date', now)).toBe('unknown');
  });

  it('never reports a future timestamp as negative age', () => {
    expect(relativeTime(new Date(now + 60_000).toISOString(), now)).toBe('just now');
  });
});
