import { z } from 'zod';

/**
 * Schemas for the (undocumented) Sim Companies API.
 *
 * These are deliberately *tolerant*. We do not control the upstream contract and it
 * has no published versioning policy, so a schema that demands an exact shape would
 * take the whole site down the first time the game ships a harmless new field.
 *
 * The strategy is:
 *   - accept unknown keys everywhere,
 *   - require only the handful of fields we genuinely cannot work without,
 *   - treat everything else as optional and normalise it in `normalise.ts`,
 *   - record which optional fields were missing so the admin dashboard can show
 *     drift before it becomes a user-visible bug.
 *
 * Field names below were derived from community documentation of the API rather than
 * from an official specification. Where a field is known by more than one name across
 * API versions, both spellings are accepted.
 */

const looseNumber = z.union([z.number(), z.string().transform((s) => Number(s))]).pipe(z.number().finite());

const optionalNumber = looseNumber.optional().nullable();
const optionalString = z.string().optional().nullable();
const optionalBool = z.boolean().optional().nullable();

/** A single Exchange offer for one resource at one quality. */
export const rawMarketOfferSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional().nullable(),
    kind: optionalNumber,
    /** Resource id this offer is for; absent on per-resource endpoints. */
    resource: optionalNumber,
    quality: looseNumber,
    price: looseNumber,
    quantity: looseNumber,
    seller: z
      .object({
        id: z.union([z.number(), z.string()]).optional().nullable(),
        company: optionalString,
      })
      .loose()
      .optional()
      .nullable(),
  })
  .loose();

export type RawMarketOffer = z.infer<typeof rawMarketOfferSchema>;

export const rawMarketResponseSchema = z.array(rawMarketOfferSchema);

/**
 * Whole-market headline ticker.
 *
 * Verified live against:
 *   GET /api/v3/market-ticker/{realmId}/
 *
 * `price` is normally numeric but the game returns the literal string
 * "sold out" when no current headline price exists.
 */
export const rawMarketTickerEntrySchema = z
  .object({
    kind: looseNumber,
    image: optionalString,
    price: z.union([looseNumber, z.literal('sold out')]),
    is_up: optionalBool,
    realmId: optionalNumber,
  })
  .loose();

export type RawMarketTickerEntry = z.infer<typeof rawMarketTickerEntrySchema>;

export const rawMarketTickerResponseSchema = z.array(rawMarketTickerEntrySchema);

/**
 * One entry of the encyclopedia resource index.
 *
 * `db_letter` is the game's own identifier for a resource and is what every other
 * endpoint expects in its path.
 */
export const rawResourceSchema = z
  .object({
    db_letter: optionalNumber,
    id: optionalNumber,
    name: z.string().min(1),
    image: optionalString,
    /** Transport units consumed per unit of this resource. */
    transportation: optionalNumber,
    /** Base units produced per hour, per building level, before modifiers. */
    anHour: optionalNumber,
    producedAnHour: optionalNumber,
    /** Whether the resource can be sold through retail buildings. */
    retailable: optionalBool,
    /** Whether the resource is a research/abstract good rather than a physical one. */
    research: optionalBool,
    realmAvailable: z.union([z.number(), z.boolean(), z.null()]).optional(),
    /** Base retail sale price hint, when the encyclopedia exposes one. */
    baseSalary: optionalNumber,
  })
  .loose();

export type RawResource = z.infer<typeof rawResourceSchema>;

export const rawResourceListSchema = z.array(rawResourceSchema);

/** A recipe input line: how much of another resource one output unit consumes. */
export const rawRecipeInputSchema = z
  .object({
    resource: z
      .union([
        looseNumber,
        z
          .object({ db_letter: optionalNumber, id: optionalNumber, name: optionalString })
          .loose(),
      ])
      .optional()
      .nullable(),
    db_letter: optionalNumber,
    name: optionalString,
    amount: optionalNumber,
    quantity: optionalNumber,
  })
  .loose();

/** Detail view for a single resource at a single quality. */
export const rawResourceDetailSchema = z
  .object({
    db_letter: optionalNumber,
    id: optionalNumber,
    name: optionalString,
    image: optionalString,
    transportation: optionalNumber,
    anHour: optionalNumber,
    producedAnHour: optionalNumber,
    retailable: optionalBool,
    /** Recipe inputs. Field name varies between API versions. */
    producedFrom: z.array(rawRecipeInputSchema).optional().nullable(),
    neededFor: z.array(rawRecipeInputSchema).optional().nullable(),
    producedIn: z
      .union([
        optionalString,
        z.object({ name: optionalString, kind: optionalString }).loose(),
        z.array(z.union([optionalString, z.object({ name: optionalString, kind: optionalString }).loose()])),
      ])
      .optional()
      .nullable(),
    /** Live v4 encyclopedia field for the building kind/code that produces this resource. */
    producedAt: z
      .union([
        optionalString,
        z.object({ name: optionalString, kind: optionalString }).loose(),
        z.array(z.union([optionalString, z.object({ name: optionalString, kind: optionalString }).loose()])),
      ])
      .optional()
      .nullable(),
  })
  .loose();

export type RawResourceDetail = z.infer<typeof rawResourceDetailSchema>;

/** Production line advertised by a building in the encyclopedia. */
export const rawBuildingProductionSchema = z
  .object({
    resource: z
      .union([
        looseNumber,
        z.object({ db_letter: optionalNumber, id: optionalNumber, name: optionalString, anHour: optionalNumber }).loose(),
      ])
      .optional()
      .nullable(),
    name: optionalString,
    anHour: optionalNumber,
  })
  .loose();

export const rawBuildingSchema = z
  .object({
    name: z.string().min(1),
    kind: optionalString,
    image: optionalString,
    /** Construction cost, in the unit given by `costUnits`. */
    cost: optionalNumber,
    costUnits: optionalString,
    /** Hourly wage bill per building level at 100% staffing. */
    wages: optionalNumber,
    secondsToBuild: optionalNumber,
    category: optionalString,
    robotsNeeded: optionalNumber,
    realmAvailable: z.union([z.number(), z.boolean(), z.null()]).optional(),
    production: z.array(rawBuildingProductionSchema).optional().nullable(),
    retail: z.union([z.boolean(), z.array(z.unknown()), z.null()]).optional(),
  })
  .loose();

export type RawBuilding = z.infer<typeof rawBuildingSchema>;

export const rawBuildingListSchema = z.array(rawBuildingSchema);

/** Public company profile (`/api/v2/companies-by-company/{realm}/{name}/`). */
export const rawCompanySchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional().nullable(),
    company: optionalString,
    name: optionalString,
    level: optionalNumber,
    value: optionalNumber,
    logo: optionalString,
    buildings: z.array(z.unknown()).optional().nullable(),
  })
  .loose();

export type RawCompany = z.infer<typeof rawCompanySchema>;
