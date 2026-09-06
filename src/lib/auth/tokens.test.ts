import { describe, expect, it } from 'vitest';
import { generateId, generateToken, hashToken, isPlausibleEmail, normaliseEmail, safeEqual } from './tokens';

describe('generateToken', () => {
  it('produces URL-safe tokens with substantial entropy', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(tokens.size).toBe(500);
  });

  it('generates distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateId()));
    expect(ids.size).toBe(500);
  });
});

describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('does not reveal the token', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it('differs for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('safeEqual', () => {
  it('matches identical strings', () => {
    const hash = hashToken('x');
    expect(safeEqual(hash, hash)).toBe(true);
  });

  it('rejects different strings', () => {
    expect(safeEqual(hashToken('a'), hashToken('b'))).toBe(false);
  });

  it('rejects length mismatches without throwing', () => {
    expect(safeEqual('short', 'a much longer value')).toBe(false);
  });

  it('handles empty input', () => {
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('lower-cases and trims', () => {
    expect(normaliseEmail('  Player@Example.COM ')).toBe('player@example.com');
  });

  it('keeps plus-tags and dots, which are provider-specific', () => {
    // Merging these would combine genuinely separate accounts on most providers.
    expect(normaliseEmail('a.b+tag@example.com')).toBe('a.b+tag@example.com');
  });
});

describe('isPlausibleEmail', () => {
  it('accepts ordinary addresses', () => {
    for (const email of ['a@b.co', 'player+tag@example.com', 'first.last@sub.example.org']) {
      expect(isPlausibleEmail(email), email).toBe(true);
    }
  });

  it('rejects malformed input', () => {
    for (const email of ['', 'nope', 'a@b', '@example.com', 'a@.com', 'a b@example.com', 'a@@example.com']) {
      expect(isPlausibleEmail(email), email).toBe(false);
    }
  });

  it('rejects absurdly long input rather than processing it', () => {
    expect(isPlausibleEmail(`${'a'.repeat(300)}@example.com`)).toBe(false);
  });
});
