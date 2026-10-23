/**
 * Applies pending migrations from ./drizzle (see migrations.ts for the foreign-key handling).
 *   bun run db:generate   (drizzle-kit writes SQL from schema.ts changes; commit the output)
 *   bun run db:migrate
 */
import { createDb } from "./client";
import { runMigrations } from "./migrations";

try {
  runMigrations(createDb());
  console.log("migrations: up to date");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
