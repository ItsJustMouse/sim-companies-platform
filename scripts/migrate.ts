/**
 * Applies pending SQL migrations, then exits.
 *
 * Run as a release step before the new application version starts serving
 * (see docs/DEPLOYMENT.md).
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db } from '../src/lib/db/client';

async function main(): Promise<void> {
  console.warn('Applying migrations from ./drizzle …');
  await migrate(db(), { migrationsFolder: './drizzle' });
  console.warn('Migrations applied.');
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error('Migration failed:', error);
  await closeDb().catch(() => {});
  process.exit(1);
});
