import { describe, expect, it } from 'vitest';
import { validate } from './local';

/**
 * Storage content is user-editable, so it is untrusted input. These tests cover the
 * rejection and clamping paths rather than the happy one.
 */
describe('validate', () => {
  it('accepts a well-formed company', () => {
    const result = validate({
      name: 'Acme',
      realmId: 0,
      cash: 1000,
      level: 12,
      adminOverhead: 8.5,
      buildings: [{ label: 'Farm 1', kind: 'farm', level: 3, producingResourceId: 4, idle: false }],
      savedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result?.name).toBe('Acme');
    expect(result?.buildings).toHaveLength(1);
    expect(result?.buildings[0]?.level).toBe(3);
  });

  it('rejects anything without a usable name', () => {
    expect(validate({})).toBeNull();
    expect(validate({ name: 123 })).toBeNull();
    expect(validate(null)).toBeNull();
    expect(validate('a string')).toBeNull();
    expect(validate([])).toBeNull();
  });

  it('caps string lengths so a pasted blob cannot bloat storage', () => {
    expect(validate({ name: 'x'.repeat(5000) })?.name.length).toBe(80);
  });

  it('caps the number of buildings', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ label: `B${i}`, level: 1 }));
    expect(validate({ name: 'Acme', buildings: many })?.buildings.length).toBe(500);
  });

  it('clamps out-of-range numbers instead of trusting them', () => {
    const result = validate({ name: 'Acme', cash: -50, level: 99_999, adminOverhead: 1e9, realmId: 77 });
    expect(result?.cash).toBe(0);
    expect(result?.level).toBe(1000);
    expect(result?.adminOverhead).toBe(100);
    expect(result?.realmId).toBe(1);
  });

  it('drops malformed buildings rather than failing the whole import', () => {
    const result = validate({
      name: 'Acme',
      buildings: [{ label: 'Good', level: 2 }, null, 'nope', { level: 3 }, { label: 'Also good' }],
    });
    expect(result?.buildings.map((b) => b.label)).toEqual(['Good', 'Also good']);
  });

  it('treats a non-array buildings field as empty', () => {
    expect(validate({ name: 'Acme', buildings: 'lots' })?.buildings).toEqual([]);
  });

  it('defaults idle to false unless it is exactly true', () => {
    expect(validate({ name: 'A', buildings: [{ label: 'B', idle: 'yes' }] })?.buildings[0]?.idle).toBe(false);
  });

  it('coerces numeric strings but rejects nonsense', () => {
    const result = validate({ name: 'A', cash: '500', level: 'abc' });
    expect(result?.cash).toBe(500);
    expect(result?.level).toBeNull();
  });
});
