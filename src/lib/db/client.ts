import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Database handle.
 *
 * A single pool per process, created lazily so that build-time code paths and unit
 * tests never open a connection they do not use. `postgres.js` is used directly
 * rather than through an ORM runtime because every query in this application is
 * either a simple lookup or a hand-tuned aggregate, and Drizzle gives us typed SQL
 * without a query-planner of its own getting in the way.
 */

let sqlClient: postgres.Sql | null = null;
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

export function sqlConnection(): postgres.Sql {
  if (sqlClient) return sqlClient;
  const config = env();
  sqlClient = postgres(config.DATABASE_URL, {
    max: config.DATABASE_POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 10,
    // Parameterised everywhere; this only disables the *client-side* prepared
    // statement cache, which pgbouncer in transaction mode cannot support.
    prepare: false,
    onnotice: () => {},
  });
  return sqlClient;
}

export function db(): PostgresJsDatabase<typeof schema> {
  dbInstance ??= drizzle(sqlConnection(), { schema });
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbInstance = null;
  }
}

export async function databaseHealth(): Promise<{ ok: boolean; latencyMs: number | null; detail?: string }> {
  const startedAt = Date.now();
  try {
    await sqlConnection()`select 1`;
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export { schema };
