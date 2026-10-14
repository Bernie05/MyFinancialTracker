/**
 * Seeds default categories, and sample transactions for the current month.
 *   bun run db:seed             categories only (safe to re-run)
 *   bun run db:seed --sample    also adds this month's sample transactions
 */
import { createDb } from "./client";
import { categories, transactions, type TransactionType } from "./schema";

const defaults: { name: string; type: TransactionType; color: number }[] = [
  { name: "Groceries", type: "expense", color: 1 },
  { name: "Bills & utilities", type: "expense", color: 2 },
  { name: "Transport", type: "expense", color: 3 },
  { name: "Dining out", type: "expense", color: 4 },
  { name: "Shopping", type: "expense", color: 5 },
  { name: "Health", type: "expense", color: 6 },
  { name: "Salary", type: "income", color: 1 },
  { name: "Freelance", type: "income", color: 3 },
  { name: "Other income", type: "income", color: 5 },
];

const db = createDb();

await db.insert(categories).values(defaults).onConflictDoNothing();
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
