/**
 * Applies pending migrations from ./drizzle.
 *   bun run db:generate   (drizzle-kit writes SQL from schema.ts changes; commit the output)
 *   bun run db:migrate
 *
 * SQLite rebuilds a table to change a column, and `PRAGMA foreign_keys=OFF` inside a migration is
 * ignored because the migrator runs in a transaction. With enforcement on, dropping the old
 * `categories` table would trip (or cascade) the foreign keys that point at it. So enforcement is
 * switched off around the run (SQLite's documented procedure), then every reference is re-checked.
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDb } from "./client";

const db = createDb();
db.run(sql`PRAGMA foreign_keys = OFF`);
migrate(db, { migrationsFolder: "./drizzle" });
const broken = db.all(sql`PRAGMA foreign_key_check`);
db.run(sql`PRAGMA foreign_keys = ON`);
if (broken.length > 0) {
  console.error("migrations: foreign key check failed", broken);
  process.exit(1);
}
console.log("migrations: up to date");
