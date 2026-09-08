import { describe, expect, it } from 'vitest';
import {
  ORDER_BOOK_DEPTH_STALE_SECONDS,
  classifyDepthFreshness,
} from './service';

describe('classifyDepthFreshness', () => {
  it('reports unavailable when depth has never been measured', () => {
    expect(classifyDepthFreshness(null)).toBe('unavailable');
  });

  it('keeps recent depth recorded', () => {
    expect(
      classifyDepthFreshness(ORDER_BOOK_DEPTH_STALE_SECONDS - 1),
    ).toBe('recorded');
  });

  it('marks depth stale at the 96-hour boundary', () => {
    expect(
      classifyDepthFreshness(ORDER_BOOK_DEPTH_STALE_SECONDS),
    ).toBe('stale');
  });
});
