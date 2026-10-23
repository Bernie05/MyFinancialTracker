/**
 * Makes sure every account has the default categories (safe to re-run).
 *   bun run db:seed
 * New accounts get them on registration; this tops up accounts created before a default was added.
 * For demo data (and the demo account) use `bun run db:seed:demo`.
 */
import { runAsUser } from "../context";
import { createDrizzleRepositories } from "../repositories/drizzle";
import { createDb } from "./client";
import { ensureDefaultCategories } from "./defaults";
import { users } from "./schema";

const db = createDb();
const repos = createDrizzleRepositories(db);
const accounts = await db.select({ id: users.id, email: users.email }).from(users);
let added = 0;
for (const account of accounts) added += await runAsUser(account.id, () => ensureDefaultCategories(repos));
console.log(`seed: default categories ensured for ${accounts.length} account(s); ${added} added`);
