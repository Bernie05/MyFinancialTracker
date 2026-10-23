/**
 * Seeds default categories, and sample transactions for the current month.
 *   bun run db:seed             categories only (safe to re-run)
 *   bun run db:seed --sample    also adds this month's sample transactions
 */
import { categoryColorPresets, colorOwner, type CategoryColorPreset } from "../../shared/contracts";
import { createDb } from "./client";
import { categories, transactions, type TransactionType } from "./schema";

// Colors are preset keys (see categoryColorPresets). Existing rows keep theirs: the insert skips names that exist.
const defaults: { name: string; type: TransactionType; color: CategoryColorPreset }[] = [
  { name: "Groceries", type: "expense", color: "green" },
  { name: "Bills & utilities", type: "expense", color: "red" },
  { name: "Transport", type: "expense", color: "blue" },
  { name: "Dining out", type: "expense", color: "orange" },
  { name: "Shopping", type: "expense", color: "purple" },
  { name: "Health", type: "expense", color: "pink" },
  { name: "Salary", type: "income", color: "teal" },
  { name: "Freelance", type: "income", color: "indigo" },
  { name: "Other income", type: "income", color: "amber" },
];

const db = createDb();

// Colors are unique. Existing categories keep theirs; a missing default whose color is taken
// gets the next preset nobody uses, so re-seeding never trips the unique index.
// Defaults are top-level categories; subcategories never clash with them.
const existing = (await db.select().from(categories)).filter((c) => c.parentId === null);
const missing = defaults.filter((d) => !existing.some((e) => e.name === d.name && e.type === d.type));
const taken = existing.map((e) => ({ id: e.id, color: e.color ?? "" }));
for (const d of missing) {
  const color = !colorOwner(taken, d.color) ? d.color : categoryColorPresets.find((p) => !colorOwner(taken, p));
  if (!color) {
    console.warn(`seed: no free color for ${d.name}; skipped (free one up on the Categories page)`);
    continue;
  }
  await db.insert(categories).values({ ...d, color });
  taken.push({ id: -1, color });
}
console.log(`seed: ${defaults.length} default categories ensured`);

if (process.argv.includes("--sample")) {
  const all = await db.select().from(categories);
  const id = (name: string) => {
    const found = all.find((c) => c.name === name);
    if (!found) throw new Error(`seed: missing category ${name}`);
    return found.id;
  };
  const month = new Date().toISOString().slice(0, 7);
  const day = (d: number) => `${month}-${String(d).padStart(2, "0")}`;

  await db.insert(transactions).values([
    { type: "income", amountMinor: 5_200_000, description: "Monthly salary", categoryId: id("Salary"), occurredOn: day(1) },
    { type: "expense", amountMinor: 284_575, description: "Puregold Cubao", categoryId: id("Groceries"), occurredOn: day(3) },
    { type: "expense", amountMinor: 389_000, description: "Meralco bill", categoryId: id("Bills & utilities"), occurredOn: day(5) },
    { type: "expense", amountMinor: 32_000, description: "Grab ride to Makati", categoryId: id("Transport"), occurredOn: day(6) },
    { type: "expense", amountMinor: 115_000, description: "Dinner with friends", categoryId: id("Dining out"), occurredOn: day(8) },
    { type: "income", amountMinor: 1_500_000, description: "Website project", categoryId: id("Freelance"), occurredOn: day(9) },
  ]);
  console.log("seed: sample transactions added for", month);
}
