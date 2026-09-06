import { describe, expect, it } from 'vitest';
import { advise, type AdviceContext } from './advise';
import type { Building, Recipe, Resource } from '@/lib/game/types';
import type { MarketRow } from '@/lib/market/service';
import type { CompanyState } from './types';

function resource(id: number, name: string, baseUnitsPerHour: number | null): Resource {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    image: null,
    transportUnits: 0,
    baseUnitsPerHour,
    retailable: true,
    isResearch: false,
    category: 'Test',
  };
}

function building(kind: string, wages: number, produces: number[]): Building {
  return {
    kind,
    name: kind,
    slug: kind,
    image: null,
    category: 'Test',
    cost: 100_000,
    costUnit: '$',
    wagesPerHourPerLevel: wages,
    secondsToBuild: 3600,
    robotsNeeded: null,
    production: produces.map((id) => ({ resourceId: id, resourceName: null, unitsPerHour: null })),
    isRetail: false,
  };
}

function row(resourceId: number, price: number): MarketRow {
  return {
    resource: resource(resourceId, `R${resourceId}`, 10),
    quote: {
      resourceId,
      realmId: 0,
      lowestPrice: price,
      pricesByQuality: { 0: price },
      totalQuantity: 10_000,
      offerCount: 20,
      weightedAveragePrice: price,
      medianPrice: price,
      highestPrice: price,
      qualitiesAvailable: [0],
      observedAt: '2026-03-01T00:00:00.000Z',
    },
    change1h: null,
    change24h: null,
    change7d: null,
    volatility7d: null,
    liquidity: 60,
    trend: 'flat',
    high30d: null,
    low30d: null,
    observedAt: '2026-03-01T00:00:00.000Z',
  };
}

function context(overrides: Partial<AdviceContext> = {}): AdviceContext {
  const company: CompanyState = {
    name: 'Test Co',
    realmId: 0,
    source: 'manual',
    cash: 0,
    level: 5,
    reportedValue: null,
    adminOverhead: 0,
    buildings: [],
    inventory: [],
    capturedAt: '2026-03-01T00:00:00.000Z',
  };

  // Product 1 sells at 100 and costs 10/unit in wages: strongly profitable.
  // Product 2 sells at 1: deeply loss-making in the same building.
  const resources = new Map([
    [1, resource(1, 'Widget', 10)],
    [2, resource(2, 'Doodad', 10)],
  ]);

  return {
    company,
    rows: new Map([
      [1, row(1, 100)],
      [2, row(2, 1)],
    ]),
    resources,
    buildings: new Map([['factory', building('factory', 100, [1, 2])]]),
    recipes: new Map<number, Recipe>(),
    ...overrides,
  };
}

describe('advise — idle buildings', () => {
  it('flags an idle building as critical and prices the waste', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 3, producingResourceId: null, idle: true }],
      },
    });

    const idle = result.recommendations.find((r) => r.id.startsWith('idle:'));
    expect(idle?.severity).toBe('critical');
    // 100/hour/level x 3 levels
    expect(idle?.evidence.some((e) => e.value.includes('300'))).toBe(true);
  });

  it('names a product the idle building could be making', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 1, producingResourceId: null, idle: true }],
      },
    });
    const idle = result.recommendations.find((r) => r.id.startsWith('idle:'));
    expect(idle?.evidence.some((e) => e.label.includes('Widget'))).toBe(true);
  });
});

describe('advise — loss-making production', () => {
  it('flags a line producing below break-even', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 1, producingResourceId: 2, idle: false }],
      },
    });

    const loss = result.recommendations.find((r) => r.id.startsWith('loss:'));
    expect(loss).toBeDefined();
    expect(loss?.severity).toBe('critical');
    expect(loss?.impactPerHour).toBeGreaterThan(0);
  });

  it('does not flag a profitable line', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 1, producingResourceId: 1, idle: false }],
      },
    });
    expect(result.recommendations.some((r) => r.id.startsWith('loss:'))).toBe(false);
  });
});

describe('advise — switching product', () => {
  it('suggests a materially better product for a building already in use', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 2, producingResourceId: 2, idle: false }],
      },
    });
    const suggestion = result.recommendations.find((r) => r.id.startsWith('switch:'));
    expect(suggestion?.title).toContain('Widget');
    expect(suggestion?.impactPerHour).toBeGreaterThan(0);
  });

  it('stays quiet when the current product is already the best', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Factory 1', kind: 'factory', level: 1, producingResourceId: 1, idle: false }],
      },
    });
    expect(result.recommendations.some((r) => r.id.startsWith('switch:'))).toBe(false);
  });
});

describe('advise — evidence and honesty', () => {
  it('gives every recommendation numbers and assumptions', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        cash: 500_000,
        buildings: [
          { label: 'Factory 1', kind: 'factory', level: 1, producingResourceId: null, idle: true },
          { label: 'Factory 2', kind: 'factory', level: 1, producingResourceId: 2, idle: false },
        ],
      },
    });

    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const recommendation of result.recommendations) {
      expect(recommendation.evidence.length, recommendation.id).toBeGreaterThan(0);
      expect(recommendation.assumptions.length, recommendation.id).toBeGreaterThan(0);
      expect(recommendation.summary.length, recommendation.id).toBeGreaterThan(10);
    }
  });

  it('orders critical findings before opportunities', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        cash: 100_000,
        buildings: [
          { label: 'A', kind: 'factory', level: 1, producingResourceId: 2, idle: false },
          { label: 'B', kind: 'factory', level: 1, producingResourceId: null, idle: true },
        ],
      },
    });
    const severities = result.recommendations.map((r) => r.severity);
    const firstOpportunity = severities.indexOf('opportunity');
    const lastCritical = severities.lastIndexOf('critical');
    if (firstOpportunity >= 0 && lastCritical >= 0) expect(lastCritical).toBeLessThan(firstOpportunity);
  });

  it('states what it could not assess rather than staying silent', () => {
    const result = advise(context());
    expect(result.limitations.some((l) => l.includes('No buildings'))).toBe(true);
  });

  it('explains the limits of a public profile', () => {
    const base = context();
    const result = advise({ ...base, company: { ...base.company, source: 'public-profile' } });
    expect(result.limitations.some((l) => l.includes('public profile'))).toBe(true);
  });

  it('reports no market prices as a limitation rather than advising blindly', () => {
    const base = context();
    const result = advise({ ...base, rows: new Map() });
    expect(result.limitations.some((l) => l.includes('No market prices'))).toBe(true);
  });
});

describe('advise — idle is derived, not just declared', () => {
  it('treats a building with nothing assigned as idle even when the flag says otherwise', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [{ label: 'Unassigned', kind: 'factory', level: 1, producingResourceId: null, idle: false }],
      },
    });
    expect(result.recommendations.some((r) => r.id === 'idle:Unassigned')).toBe(true);
  });

  it('reports every idle building, not just the last one', () => {
    const base = context();
    const result = advise({
      ...base,
      company: {
        ...base.company,
        buildings: [
          { label: 'One', kind: 'factory', level: 1, producingResourceId: null, idle: false },
          { label: 'Two', kind: 'factory', level: 1, producingResourceId: null, idle: true },
        ],
      },
    });
    expect(result.recommendations.filter((r) => r.id.startsWith('idle:'))).toHaveLength(2);
  });
});
