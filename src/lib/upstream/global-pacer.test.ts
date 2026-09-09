import { describe, expect, it, vi } from 'vitest';
import { GlobalRequestPacer, type GlobalRequestTurn } from './global-pacer';

function turn(
  waitMs: number,
  order: string[] = [],
): GlobalRequestTurn {
  return {
    waitMs,
    markStarted: vi.fn(async () => {
      order.push('mark-started');
    }),
    release: vi.fn(async () => {
      order.push('release');
    }),
  };
}

describe('GlobalRequestPacer', () => {
  it('releases and waits before re-checking the global interval', async () => {
    const order: string[] = [];
    const first = turn(125, order);
    const second = turn(0, order);

    const acquire = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const sleeper = vi.fn(async (ms: number) => {
      order.push(`sleep:${ms}`);
    });

    const pacer = new GlobalRequestPacer(acquire, sleeper);

    const result = await pacer.schedule(async () => {
      order.push('request-start');
      return 42;
    }, 300_000);

    expect(result).toBe(42);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenNthCalledWith(1, 300_000);
    expect(acquire).toHaveBeenNthCalledWith(2, 300_000);
    expect(sleeper).toHaveBeenCalledWith(125);
    expect(order).toEqual([
      'release',
      'sleep:125',
      'request-start',
      'mark-started',
      'release',
    ]);
  });

  it('records the start after the request has been initiated', async () => {
    const order: string[] = [];
    const activeTurn = turn(0, order);
    const acquire = vi.fn(async () => activeTurn);
    const sleeper = vi.fn(async () => undefined);

    const pacer = new GlobalRequestPacer(acquire, sleeper);

    await pacer.schedule(async () => {
      order.push('request-start');
      await Promise.resolve();
      order.push('request-finish');
      return 'ok';
    }, 300_000);

    expect(order[0]).toBe('request-start');
    expect(order[1]).toBe('mark-started');
    expect(order.at(-1)).toBe('release');
  });

  it('does not run the request if global coordination fails', async () => {
    const acquire = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const sleeper = vi.fn(async () => undefined);
    const fn = vi.fn(async () => 'should not run');

    const pacer = new GlobalRequestPacer(acquire, sleeper);

    await expect(pacer.schedule(fn, 300_000)).rejects.toThrow(
      'database unavailable',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('fails closed if the request started but its start time cannot be persisted', async () => {
    const release = vi.fn(async () => undefined);
    const markStarted = vi.fn(async () => {
      throw new Error('database write failed');
    });

    const acquire = vi.fn(async (): Promise<GlobalRequestTurn> => ({
      waitMs: 0,
      markStarted,
      release,
    }));

    const sleeper = vi.fn(async (_ms: number) => undefined);
    const fn = vi.fn(async () => 'request completed');

    const pacer = new GlobalRequestPacer(acquire, sleeper);

    await expect(pacer.schedule(fn, 300_000)).rejects.toThrow(
      'Unable to persist the global upstream request start',
    );

    expect(fn).toHaveBeenCalledOnce();
    expect(sleeper).toHaveBeenCalledOnce();
    expect(Number(sleeper.mock.calls[0]?.[0])).toBeGreaterThan(299_000);
    expect(release).toHaveBeenCalledOnce();
  });

  it('allows an explicit zero interval without consulting PostgreSQL', async () => {
    const acquire = vi.fn(async () => turn(500));
    const sleeper = vi.fn(async () => undefined);
    const fn = vi.fn(async () => 'ok');

    const pacer = new GlobalRequestPacer(acquire, sleeper);

    await expect(pacer.schedule(fn, 0)).resolves.toBe('ok');
    expect(acquire).not.toHaveBeenCalled();
    expect(sleeper).not.toHaveBeenCalled();
  });
});
