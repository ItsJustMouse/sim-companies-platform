import { describe, expect, it } from 'vitest';
import { areaPath, linePath, linearScale, niceTicks, padDomain } from './scale';

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = linearScale([0, 100], [0, 500]);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(250);
    expect(scale(100)).toBe(500);
  });

  it('supports an inverted range, as SVG y-axes need', () => {
    const scale = linearScale([0, 10], [200, 0]);
    expect(scale(0)).toBe(200);
    expect(scale(10)).toBe(0);
  });

  it('does not produce NaN for a flat domain', () => {
    const scale = linearScale([5, 5], [0, 100]);
    expect(scale(5)).toBe(50);
    expect(Number.isNaN(scale(5))).toBe(false);
  });
});

describe('niceTicks', () => {
  it('produces round numbers', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('handles small ranges without floating point noise', () => {
    const ticks = niceTicks(0.1, 0.5, 4);
    expect(ticks.every((t) => Number.isFinite(t))).toBe(true);
    for (const tick of ticks) expect(tick).toBeCloseTo(Math.round(tick * 100) / 100, 8);
  });

  it('returns a single tick for a flat range', () => {
    expect(niceTicks(7, 7)).toEqual([7]);
  });

  it('returns nothing for non-finite input', () => {
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
  });

  it('never runs away on an extreme range', () => {
    expect(niceTicks(0, 1e12, 5).length).toBeLessThanOrEqual(24);
  });
});

describe('padDomain', () => {
  it('adds headroom proportional to the span', () => {
    expect(padDomain(0, 100, 0.1)).toEqual([-10, 110]);
  });

  it('pads a flat series so it is not drawn on the axis', () => {
    const [low, high] = padDomain(50, 50);
    expect(low).toBeLessThan(50);
    expect(high).toBeGreaterThan(50);
  });

  it('pads a flat zero series without collapsing', () => {
    const [low, high] = padDomain(0, 0);
    expect(high - low).toBeGreaterThan(0);
  });
});

describe('linePath', () => {
  it('draws a continuous path', () => {
    expect(linePath([[0, 0], [10, 5]])).toBe('M0.00,0.00 L10.00,5.00');
  });

  it('breaks the path at gaps instead of bridging them', () => {
    const path = linePath([[0, 0], null, [10, 5]]);
    expect(path).toBe('M0.00,0.00 M10.00,5.00');
  });

  it('returns an empty string for no points', () => {
    expect(linePath([])).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the shape down to the baseline', () => {
    const path = areaPath([[0, 10], [10, 20]], 100);
    expect(path.startsWith('M0.00,10.00')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('100.00');
  });

  it('returns an empty string for no points', () => {
    expect(areaPath([], 100)).toBe('');
  });
});
