import { describe, expect, it } from 'vitest';
import { normaliseMarketTicker } from './normalise';
import { rawMarketTickerResponseSchema } from './schemas';

describe('market ticker contract', () => {
  it('parses and normalises a verified numeric ticker row', () => {
    const raw = rawMarketTickerResponseSchema.parse([
      {
        kind: 66,
        image: 'images/resources/seeds.png',
        price: 0.279,
        is_up: false,
        realmId: 0,
      },
    ]);

    expect(normaliseMarketTicker(raw, 0)).toEqual([
      {
        resourceId: 66,
        realmId: 0,
        image: 'images/resources/seeds.png',
        price: 0.279,
        soldOut: false,
        isUp: false,
      },
    ]);
  });

  it('represents sold-out resources as null price rather than zero', () => {
    const raw = rawMarketTickerResponseSchema.parse([
      {
        kind: 153,
        image: 'images/resources/icecream-chocolate.png',
        price: 'sold out',
        is_up: true,
        realmId: 0,
      },
    ]);

    expect(normaliseMarketTicker(raw, 0)).toEqual([
      {
        resourceId: 153,
        realmId: 0,
        image: 'images/resources/icecream-chocolate.png',
        price: null,
        soldOut: true,
        isUp: true,
      },
    ]);
  });

  it('deduplicates resource ids defensively', () => {
    const raw = rawMarketTickerResponseSchema.parse([
      {
        kind: 5,
        image: 'images/resources/grapes.png',
        price: 3.05,
        is_up: true,
        realmId: 0,
      },
      {
        kind: 5,
        image: 'images/resources/grapes.png',
        price: 3.10,
        is_up: false,
        realmId: 0,
      },
    ]);

    expect(normaliseMarketTicker(raw, 0)).toHaveLength(1);
  });
});
