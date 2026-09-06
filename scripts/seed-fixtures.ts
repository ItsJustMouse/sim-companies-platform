/**
 * Development fixture seeder.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Sim Companies API is the only source of real prices, and it is not reachable
 * from every development environment. Rather than build the interface blind, this
 * seeder populates the database with an obviously-synthetic catalogue and 30 days of
 * synthetic price history so layouts, charts, calculators and the opportunity
 * scanner can be exercised end to end.
 *
 * HOW IT STAYS HONEST
 * -------------------
 *   1. It refuses to run when NODE_ENV=production.
 *   2. Every fixture product name begins with "Sample", so no row can be mistaken
 *      for a real commodity even out of context.
 *   3. It sets the `fixture_data` system flag, which makes every page in the
 *      application render a persistent banner stating the prices are not real.
 *
 * Running the real catalog sync (`npm run worker:once`) against a live API clears
 * the flag, because at that point the database holds genuine observations.
 */
import { closeDb, db } from '../src/lib/db/client';
import { FLAG_KEYS, setFlag } from '../src/lib/db/flags';
import { marketSnapshots } from '../src/lib/db/schema';
import { upsertBuildings, upsertRecipe, upsertResources } from '../src/lib/catalog/repository';
import type { Building, Recipe, Resource } from '../src/lib/game/types';
import { slugify } from '../src/lib/util/slug';

const REALM_ID = 0;

/** Deterministic PRNG so repeated seeds produce identical data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FixtureSpec {
  name: string;
  category: string;
  basePrice: number;
  unitsPerHour: number;
  transport: number;
  retailable: boolean;
  inputs?: { name: string; amount: number }[];
  producedIn: string;
}

/**
 * A miniature but structurally complete economy: raw extraction feeding
 * intermediates feeding finished goods, so production chains, vertical-integration
 * comparisons and multi-level cost roll-ups all have something real to chew on.
 */
const SPECS: FixtureSpec[] = [
  { name: 'Sample Water', category: 'Raw', basePrice: 0.6, unitsPerHour: 2400, transport: 0.01, retailable: false, producedIn: 'Water reservoir' },
  { name: 'Sample Ore', category: 'Raw', basePrice: 2.4, unitsPerHour: 300, transport: 0.05, retailable: false, producedIn: 'Mine' },
  { name: 'Sample Crude', category: 'Raw', basePrice: 4.1, unitsPerHour: 180, transport: 0.04, retailable: false, producedIn: 'Oil rig' },
  { name: 'Sample Grain', category: 'Agriculture', basePrice: 1.8, unitsPerHour: 640, transport: 0.02, retailable: false, producedIn: 'Farm' },
  { name: 'Sample Fruit', category: 'Agriculture', basePrice: 3.2, unitsPerHour: 420, transport: 0.02, retailable: true, producedIn: 'Plantation' },
  { name: 'Sample Timber', category: 'Raw', basePrice: 2.9, unitsPerHour: 260, transport: 0.06, retailable: false, producedIn: 'Plantation' },
  { name: 'Sample Power', category: 'Energy', basePrice: 0.19, unitsPerHour: 9000, transport: 0, retailable: false, producedIn: 'Power plant' },

  { name: 'Sample Metal', category: 'Intermediate', basePrice: 9.4, unitsPerHour: 120, transport: 0.09, retailable: false, producedIn: 'Refinery', inputs: [{ name: 'Sample Ore', amount: 3 }, { name: 'Sample Power', amount: 8 }] },
  { name: 'Sample Plastic', category: 'Intermediate', basePrice: 7.1, unitsPerHour: 150, transport: 0.07, retailable: false, producedIn: 'Refinery', inputs: [{ name: 'Sample Crude', amount: 1.5 }, { name: 'Sample Power', amount: 5 }] },
  { name: 'Sample Flour', category: 'Intermediate', basePrice: 4.6, unitsPerHour: 220, transport: 0.03, retailable: false, producedIn: 'Factory', inputs: [{ name: 'Sample Grain', amount: 2.5 }] },
  { name: 'Sample Fabric', category: 'Intermediate', basePrice: 11.2, unitsPerHour: 90, transport: 0.05, retailable: false, producedIn: 'Fashion factory', inputs: [{ name: 'Sample Timber', amount: 1.2 }, { name: 'Sample Water', amount: 20 }] },
  { name: 'Sample Circuit', category: 'Intermediate', basePrice: 26.5, unitsPerHour: 45, transport: 0.03, retailable: false, producedIn: 'Electronics factory', inputs: [{ name: 'Sample Metal', amount: 1.4 }, { name: 'Sample Plastic', amount: 0.8 }] },

  { name: 'Sample Bread', category: 'Consumer goods', basePrice: 12.8, unitsPerHour: 80, transport: 0.04, retailable: true, producedIn: 'Factory', inputs: [{ name: 'Sample Flour', amount: 1.6 }, { name: 'Sample Water', amount: 4 }] },
  { name: 'Sample Juice', category: 'Consumer goods', basePrice: 15.4, unitsPerHour: 70, transport: 0.05, retailable: true, producedIn: 'Beverage factory', inputs: [{ name: 'Sample Fruit', amount: 2.2 }, { name: 'Sample Water', amount: 6 }] },
  { name: 'Sample Garment', category: 'Consumer goods', basePrice: 41.0, unitsPerHour: 26, transport: 0.08, retailable: true, producedIn: 'Fashion factory', inputs: [{ name: 'Sample Fabric', amount: 2.4 }] },
  { name: 'Sample Handset', category: 'Electronics', basePrice: 118.0, unitsPerHour: 12, transport: 0.05, retailable: true, producedIn: 'Electronics factory', inputs: [{ name: 'Sample Circuit', amount: 2.6 }, { name: 'Sample Plastic', amount: 1.1 }] },
  { name: 'Sample Appliance', category: 'Electronics', basePrice: 176.0, unitsPerHour: 8, transport: 0.14, retailable: true, producedIn: 'Factory', inputs: [{ name: 'Sample Circuit', amount: 1.8 }, { name: 'Sample Metal', amount: 4.5 }] },
  { name: 'Sample Vehicle', category: 'Automotive', basePrice: 940.0, unitsPerHour: 2.2, transport: 0.6, retailable: true, producedIn: 'Car factory', inputs: [{ name: 'Sample Metal', amount: 22 }, { name: 'Sample Circuit', amount: 6 }, { name: 'Sample Plastic', amount: 14 }] },
];

const BUILDING_SPECS: { name: string; category: string; wages: number; cost: number; hours: number; retail?: boolean }[] = [
  { name: 'Water reservoir', category: 'Extraction', wages: 42, cost: 60_000, hours: 6 },
  { name: 'Mine', category: 'Extraction', wages: 118, cost: 180_000, hours: 12 },
  { name: 'Oil rig', category: 'Extraction', wages: 164, cost: 240_000, hours: 14 },
  { name: 'Farm', category: 'Agriculture', wages: 58, cost: 90_000, hours: 8 },
  { name: 'Plantation', category: 'Agriculture', wages: 66, cost: 110_000, hours: 9 },
  { name: 'Power plant', category: 'Energy', wages: 210, cost: 320_000, hours: 18 },
  { name: 'Refinery', category: 'Processing', wages: 246, cost: 410_000, hours: 20 },
  { name: 'Factory', category: 'Manufacturing', wages: 188, cost: 300_000, hours: 16 },
  { name: 'Beverage factory', category: 'Manufacturing', wages: 142, cost: 220_000, hours: 13 },
  { name: 'Fashion factory', category: 'Manufacturing', wages: 132, cost: 200_000, hours: 12 },
  { name: 'Electronics factory', category: 'Manufacturing', wages: 268, cost: 480_000, hours: 22 },
  { name: 'Car factory', category: 'Manufacturing', wages: 355, cost: 720_000, hours: 30 },
  { name: 'Retail store', category: 'Retail', wages: 96, cost: 150_000, hours: 10, retail: true },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed fixture data into a production database.');
  }

  const idByName = new Map<string, number>();
  SPECS.forEach((spec, index) => idByName.set(spec.name, index + 1));

  // ---- Catalog ---------------------------------------------------------
  const resources: Resource[] = SPECS.map((spec, index) => ({
    id: index + 1,
    name: spec.name,
    slug: slugify(spec.name),
    image: null,
    transportUnits: spec.transport,
    baseUnitsPerHour: spec.unitsPerHour,
    retailable: spec.retailable,
    isResearch: false,
    category: spec.category,
  }));
  await upsertResources(REALM_ID, resources);

  const buildings: Building[] = BUILDING_SPECS.map((spec) => ({
    kind: slugify(spec.name),
    name: spec.name,
    slug: slugify(spec.name),
    image: null,
    category: spec.category,
    cost: spec.cost,
    costUnit: '$',
    wagesPerHourPerLevel: spec.wages,
    secondsToBuild: spec.hours * 3600,
    robotsNeeded: null,
    isRetail: spec.retail ?? false,
    production: SPECS.filter((s) => s.producedIn === spec.name).map((s) => ({
      resourceId: idByName.get(s.name) ?? null,
      resourceName: s.name,
      unitsPerHour: s.unitsPerHour,
    })),
  }));
  await upsertBuildings(REALM_ID, buildings);

  for (const spec of SPECS) {
    const recipe: Recipe = {
      outputResourceId: idByName.get(spec.name) as number,
      inputs: (spec.inputs ?? []).map((input) => ({
        resourceId: idByName.get(input.name) as number,
        resourceName: input.name,
        amount: input.amount,
      })),
      producedIn: [slugify(spec.producedIn)],
    };
    await upsertRecipe(REALM_ID, recipe);
  }

  // ---- Synthetic price history ----------------------------------------
  // A mean-reverting random walk: prices wander but stay anchored to the base, which
  // is roughly how a market with real supply and demand behaves. Each product gets a
  // different seed so the movers and volatility rankings are not all identical.
  const now = Date.now();
  const intervalMinutes = 60;
  const days = 30;
  const steps = (days * 24 * 60) / intervalMinutes;

  const rows: (typeof marketSnapshots.$inferInsert)[] = [];

  SPECS.forEach((spec, index) => {
    const resourceId = index + 1;
    const random = mulberry32(1000 + index * 37);
    let price = spec.basePrice;
    const drift = (random() - 0.5) * 0.0006;
    const noise = 0.006 + random() * 0.02;

    for (let step = steps; step >= 0; step -= 1) {
      const observedAt = new Date(now - step * intervalMinutes * 60_000);
      const shock = (random() - 0.5) * noise * price;
      const reversion = (spec.basePrice - price) * 0.02;
      price = Math.max(spec.basePrice * 0.35, price + shock + reversion + drift * price);

      const spread = 1 + 0.02 + random() * 0.09;
      const quantity = Math.round(spec.unitsPerHour * (25 + random() * 90));
      const offerCount = 4 + Math.floor(random() * 40);

      const pricesByQuality: Record<string, number> = { '0': round(price) };
      for (let quality = 1; quality <= 5; quality += 1) {
        pricesByQuality[String(quality)] = round(price * (1 + quality * (0.11 + random() * 0.05)));
      }

      rows.push({
        realmId: REALM_ID,
        resourceId,
        observedAt,
        lowestPrice: round(price),
        highestPrice: round(price * spread * 1.4),
        medianPrice: round(price * spread),
        weightedAveragePrice: round(price * (spread * 0.8 + 0.15)),
        totalQuantity: quantity,
        offerCount,
        pricesByQuality,
      });
    }
  });

  // Chunked to keep each statement well inside Postgres' parameter limit.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db().insert(marketSnapshots).values(rows.slice(i, i + CHUNK)).onConflictDoNothing();
  }

  await setFlag(
    FLAG_KEYS.fixtureData,
    {
      enabled: true,
      seededAt: new Date().toISOString(),
      note: 'Synthetic development data produced by scripts/seed-fixtures.ts. Not real Sim Companies prices.',
    },
    'seed-fixtures',
  );

  console.warn(
    `Seeded ${resources.length} sample products, ${buildings.length} buildings and ${rows.length} synthetic price observations.`,
  );
  console.warn('The fixture_data flag is set — the application will display a sample-data banner on every page.');
  await closeDb();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

main().catch(async (error: unknown) => {
  console.error('Seeding failed:', error);
  await closeDb().catch(() => {});
  process.exit(1);
});
