/**
 * Applies pending migrations from ./drizzle.
 *
 * SQLite rebuilds a table to change a column, and `PRAGMA foreign_keys=OFF` inside a migration is
 * ignored because the migrator runs in a transaction. With enforcement on, dropping a table that others
 * reference would trip (or cascade) their foreign keys. So enforcement is switched off around the run
 * (SQLite's documented procedure), then every reference is re-checked.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export function runMigrations(db: Db, migrationsFolder = MIGRATIONS_FOLDER) {
  db.run(sql`PRAGMA foreign_keys = OFF`);
  migrate(db, { migrationsFolder });
  const broken = db.all(sql`PRAGMA foreign_key_check`);
  db.run(sql`PRAGMA foreign_keys = ON`);
  if (broken.length > 0) throw new Error(`migrations: foreign key check failed: ${JSON.stringify(broken)}`);
}
