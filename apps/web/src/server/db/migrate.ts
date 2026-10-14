/**
 * Applies pending migrations from ./drizzle.
 *   bun run db:generate   (drizzle-kit writes SQL from schema.ts changes; commit the output)
 *   bun run db:migrate
 */
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDb } from "./client";

const db = createDb();
migrate(db, { migrationsFolder: "./drizzle" });
console.log("migrations: up to date");
