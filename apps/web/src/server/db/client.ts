import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

export const DEFAULT_DATABASE_PATH = "data/mft.sqlite";

/**
 * Opens the SQLite database with the pragmas this app relies on.
 * - foreign_keys: SQLite ships with FK enforcement OFF; turn it on per connection.
 * - journal_mode=WAL: readers don't block the writer, so the dev server stays responsive.
 */
export function createDb(path = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;
