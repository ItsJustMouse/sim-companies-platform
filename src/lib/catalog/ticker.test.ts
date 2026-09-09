import { describe, expect, it } from 'vitest';
import {
  displayNameFromSlug,
  resourceStubFromTicker,
  slugFromTickerImage,
} from './ticker';

describe('ticker-derived resource catalog', () => {
  it('derives a stable slug from the official image path', () => {
    expect(
      slugFromTickerImage('images/resources/seeds.png', 66),
    ).toBe('seeds');
  });

  it('creates a deliberately partial resource record', () => {
    expect(
      resourceStubFromTicker({
        resourceId: 66,
        realmId: 0,
        image: 'images/resources/seeds.png',
        price: 0.288,
        soldOut: false,
        isUp: true,
      }),
    ).toEqual({
      id: 66,
      name: 'Seeds',
      slug: 'seeds',
      image: 'images/resources/seeds.png',
      transportUnits: null,
      baseUnitsPerHour: null,
      retailable: null,
      isResearch: null,
      category: null,
    });
  });

  it('handles known image-slug naming exceptions', () => {
    expect(displayNameFromSlug('icecream-chocolate')).toBe(
      'Chocolate Ice Cream',
    );
    expect(displayNameFromSlug('luxury-e-car')).toBe('Luxury E-Car');
  });

  it('has a safe fallback when the image path is missing', () => {
    expect(slugFromTickerImage(null, 999)).toBe('resource-999');
  });
});
