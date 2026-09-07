import { describe, expect, it, vi } from 'vitest';
import { GlobalRequestPacer } from './global-pacer';

describe('GlobalRequestPacer', () => {
  it('waits for the globally reserved slot before running', async () => {
    const order: string[] = [];

    const reserve = vi.fn(async () => 125);
    const sleeper = vi.fn(async (ms: number) => {
      order.push(`sleep:${ms}`);
    });

    const pacer = new GlobalRequestPacer(reserve, sleeper);

    const result = await pacer.schedule(async () => {
      order.push('request');
      return 42;
    }, 300_000);

    expect(result).toBe(42);
    expect(reserve).toHaveBeenCalledWith(300_000);
    expect(sleeper).toHaveBeenCalledWith(125);
    expect(order).toEqual(['sleep:125', 'request']);
  });

  it('runs immediately when the reserved slot is available now', async () => {
    const reserve = vi.fn(async () => 0);
    const sleeper = vi.fn(async () => undefined);
    const fn = vi.fn(async () => 'ok');

    const pacer = new GlobalRequestPacer(reserve, sleeper);

    await expect(pacer.schedule(fn, 300_000)).resolves.toBe('ok');
    expect(sleeper).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not run the request if global coordination fails', async () => {
    const reserve = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const sleeper = vi.fn(async () => undefined);
    const fn = vi.fn(async () => 'should not run');

    const pacer = new GlobalRequestPacer(reserve, sleeper);

    await expect(pacer.schedule(fn, 300_000)).rejects.toThrow(
      'database unavailable',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('allows an explicit zero interval without consulting PostgreSQL', async () => {
    const reserve = vi.fn(async () => 500);
    const sleeper = vi.fn(async () => undefined);
    const fn = vi.fn(async () => 'ok');

    const pacer = new GlobalRequestPacer(reserve, sleeper);

    await expect(pacer.schedule(fn, 0)).resolves.toBe('ok');
    expect(reserve).not.toHaveBeenCalled();
    expect(sleeper).not.toHaveBeenCalled();
  });
});
