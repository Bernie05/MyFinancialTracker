/**
 * Demo transactions for the last 6 months up to today, so the dashboard and reports have
 * something to show. Run after `bun run db:seed` (it needs the default categories).
 *   bun run db:seed:demo
 *
 * Idempotent: every demo row has note = DEMO_NOTE. Each run deletes those rows and inserts
 * them again in one transaction, so running it twice never duplicates anything and your own
 * transactions are never touched. The amounts come from a fixed-seed generator, so each run
 * produces the same data.
 *
 * Credit cards: two demo cards are created if missing (kept as the user left them otherwise).
 * Some demo expenses are charged to them, and every statement whose due date has passed is paid
 * in full on its due date (demo payments are replaced each run). With the default days, BPI Gold's
 * latest statement is due within its 5-day reminder window around late October, so the alert shows.
 *
 * Installments: three demo plans (a phone at 0% over 12 months started about 3 months ago, a washer at
 * 0.79% a month over 6 months, and a finished 3-month plan), replaced on each run. Their billed months
 * are generated before past statements are paid, so the demo payments cover them too.
 */
import { and, eq, inArray } from "drizzle-orm";
import { closesBetween, dueDateFor } from "../../shared/cardCycle";
import { categoryColorPresets, colorOwner } from "../../shared/contracts";
import { createDb } from "./client";
import { defaultFirstBillingMonth } from "../../shared/installments";
import { createDrizzleRepositories } from "../repositories/drizzle";
import { cardPayments, categories, creditCards, installments, transactions, type TransactionType } from "./schema";

const DEMO_NOTE = "Demo data";
const MONTHS = 6;

// Fixed-seed PRNG (mulberry32): realistic variation that stays identical between runs.
let seed = 20261022;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** A peso amount between min and max, in centavos. */
const pesos = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)] as T;

type Row = { type: TransactionType; amountMinor: number; description: string; category: string; day: number };

function monthRows(index: number): Row[] {
  const rows: Row[] = [
    { type: "income", amountMinor: 5_200_000, description: "Monthly salary", category: "Salary", day: 1 },
    { type: "income", amountMinor: 5_200_000, description: "Monthly salary", category: "Salary", day: 16 },
    { type: "expense", amountMinor: 1_800_000, description: "Condo rent", category: "Bills & utilities", day: 2 },
    { type: "expense", amountMinor: pesos(2_800, 4_600), description: "Meralco bill", category: "Bills & utilities", day: 5 },
    { type: "expense", amountMinor: pesos(450, 700), description: "Maynilad water", category: "Bills & utilities", day: 7 },
    { type: "expense", amountMinor: 169_900, description: "PLDT fiber", category: "Bills & utilities", day: 10 },
    { type: "expense", amountMinor: 59_900, description: "Globe postpaid", category: "Bills & utilities", day: 12 },
  ];
  // Side gig: most months, not all.
  if (index % 3 !== 1) {
    rows.push({ type: "income", amountMinor: pesos(8_000, 22_000), description: pick(["Website project", "Logo design", "Landing page fix"]), category: "Freelance", day: 20 });
  }
  if (index === 3) rows.push({ type: "income", amountMinor: 450_000, description: "Sold old phone", category: "Other income", day: 14 });

  for (const day of [3, 10, 17, 24]) {
    rows.push({ type: "expense", amountMinor: pesos(1_800, 3_600), description: pick(["Puregold Cubao", "SM Supermarket", "Landers"]), category: "Groceries", day });
  }
  for (let i = 0; i < 6; i++) {
    rows.push({ type: "expense", amountMinor: pesos(120, 480), description: pick(["Grab ride", "Angkas", "MRT load", "Shell fuel"]), category: "Transport", day: 2 + i * 5 });
  }
  for (let i = 0; i < 4; i++) {
    rows.push({ type: "expense", amountMinor: pesos(350, 1_900), description: pick(["Jollibee", "Mang Inasal", "Dinner with friends", "Coffee Project", "Ramen Nagi"]), category: "Dining out", day: 4 + i * 7 });
  }
  rows.push({ type: "expense", amountMinor: pesos(800, 4_500), description: pick(["Shopee order", "Uniqlo", "Lazada order"]), category: "Shopping", day: 13 });
  if (index % 2 === 0) rows.push({ type: "expense", amountMinor: pesos(400, 2_500), description: pick(["Mercury Drug", "Dental cleaning", "Clinic checkup"]), category: "Health", day: 18 });
  // December-style spike in one month, so the chart isn't flat.
  if (index === 4) rows.push({ type: "expense", amountMinor: 1_250_000, description: "Weekend trip to Baguio", category: "Shopping", day: 26 });
  return rows;
}

const db = createDb();
// Subcategories: created under their parent if missing (they inherit its color). Kept on re-runs.
const demoSubcategories: Record<string, string[]> = {
  "Bills & utilities": ["Electric", "Water", "Internet", "Mobile"],
  Transport: ["Fuel", "Grab/Taxi"],
};
let all = await db.select().from(categories);
for (const [parentName, subs] of Object.entries(demoSubcategories)) {
  const parent = all.find((c) => c.name === parentName && c.parentId === null);
  if (!parent) continue;
  for (const name of subs) {
    if (!all.some((c) => c.name === name && c.parentId === parent.id)) {
      await db.insert(categories).values({ name, type: parent.type, color: null, parentId: parent.id });
    }
  }
}
all = await db.select().from(categories);
const categoryId = (name: string, parentName?: string) => {
  const parent = parentName ? all.find((c) => c.name === parentName && c.parentId === null) : undefined;
  const found = all.find((c) => c.name === name && c.parentId === (parent?.id ?? null));
  if (!found) throw new Error(`seed:demo: category "${name}" is missing. Run \`bun run db:seed\` first.`);
  return found.id;
};
/** Utility bills and rides go to their subcategory; everything else stays on the parent. */
const leafFor: Record<string, [string, string]> = {
  "Meralco bill": ["Electric", "Bills & utilities"],
  "Maynilad water": ["Water", "Bills & utilities"],
  "PLDT fiber": ["Internet", "Bills & utilities"],
  "Globe postpaid": ["Mobile", "Bills & utilities"],
  "Shell fuel": ["Fuel", "Transport"],
  "Grab ride": ["Grab/Taxi", "Transport"],
  Angkas: ["Grab/Taxi", "Transport"],
};
const categoryFor = (category: string, description: string) => {
  const leaf = leafFor[description];
  return leaf && all.some((c) => c.name === leaf[1] && c.parentId === null) ? categoryId(leaf[0], leaf[1]) : categoryId(category);
};

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
// Demo cards: ensure they exist; a card the user already edited keeps its settings.
const demoCards = [
  { name: "BPI Gold", issuer: "BPI", last4: "4821", limitMinor: 15_000_000, closingDay: 6, dueDay: 27, notifyDays: 5, color: "amber" },
  // Due day 31 exercises short months: September's statement is due on the 30th.
  { name: "Metrobank Visa", issuer: "Metrobank", last4: "0193", limitMinor: 8_000_000, closingDay: 20, dueDay: 31, notifyDays: 3, color: "indigo" },
] as const;
const existingCards = await db.select().from(creditCards);
for (const card of demoCards) {
  if (existingCards.some((c) => c.name === card.name)) continue;
  const color = !colorOwner(existingCards, card.color) ? card.color : categoryColorPresets.find((k) => !colorOwner(existingCards, k));
  const [row] = await db.insert(creditCards).values({ ...card, color: color ?? "grey" }).returning();
  if (row) existingCards.push(row);
}
const cardId = (name: string) => existingCards.find((c) => c.name === name)!.id;
const bpi = cardId("BPI Gold");
const metrobank = cardId("Metrobank Visa");
/** Which demo expenses go on a card: eating out and shopping on BPI, supermarkets and fuel on Metrobank. */
const cardFor = (category: string, description: string) =>
  category === "Dining out" || category === "Shopping"
    ? bpi
    : ["Landers", "SM Supermarket", "Shell fuel"].includes(description)
      ? metrobank
      : null;

const values: (typeof transactions.$inferInsert)[] = [];
for (let index = 0; index < MONTHS; index++) {
  const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - index), 1);
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  for (const row of monthRows(index)) {
    const occurredOn = `${month}-${String(row.day).padStart(2, "0")}`;
    if (occurredOn > today) continue; // nothing in the future
    const { category, day: _day, ...rest } = row;
    const card = row.type === "expense" ? cardFor(category, row.description) : null;
    values.push({ ...rest, categoryId: categoryFor(category, row.description), occurredOn, note: DEMO_NOTE, cardId: card });
  }
}

// Demo installments: dates relative to today, so "started 3 months ago" stays true whenever the seed runs.
const monthsAgo = (n: number, day: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - n, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const demoPlans = [
  { card: bpi, description: "iPhone 16 Pro (Power Mac)", purchasedOn: monthsAgo(3, 10), principalMinor: 8_399_000, months: 12, addOnRateBps: 0 },
  { card: metrobank, description: "Samsung washer (SM Appliance)", purchasedOn: monthsAgo(2, 25), principalMinor: 3_200_000, months: 6, addOnRateBps: 79 },
  { card: bpi, description: "Sony headphones (Digital Walker)", purchasedOn: monthsAgo(5, 2), principalMinor: 1_799_000, months: 3, addOnRateBps: 0 },
];
db.delete(installments)
  .where(and(inArray(installments.cardId, [bpi, metrobank]), inArray(installments.description, demoPlans.map((d) => d.description))))
  .run(); // their generated expenses go too (ON DELETE cascade)
const planIds: number[] = [];
for (const { card, ...plan } of demoPlans) {
  const closingDay = existingCards.find((c) => c.id === card)!.closingDay;
  const [row] = db
    .insert(installments)
    .values({ ...plan, cardId: card, categoryId: categoryId("Shopping"), firstBillingMonth: defaultFirstBillingMonth(plan.purchasedOn, closingDay) })
    .returning({ id: installments.id })
    .all();
  if (row) planIds.push(row.id);
}
await createDrizzleRepositories(db).installments.regenerate(planIds, today);

db.transaction((tx) => {
  tx.delete(transactions).where(eq(transactions.note, DEMO_NOTE)).run();
  tx.insert(transactions).values(values).run();
  tx.delete(cardPayments).where(and(eq(cardPayments.note, DEMO_NOTE), inArray(cardPayments.cardId, [bpi, metrobank]))).run();

  // Pay each past-due statement in full on its due date, oldest first, so balances carry correctly.
  for (const card of existingCards.filter((c) => c.id === bpi || c.id === metrobank)) {
    const charges = tx.select().from(transactions).where(eq(transactions.cardId, card.id)).all();
    const payments = tx.select().from(cardPayments).where(eq(cardPayments.cardId, card.id)).all();
    const first = charges.reduce((min, t) => (t.occurredOn < min ? t.occurredOn : min), today);
    for (const close of closesBetween(first, today, card.closingDay)) {
      const due = dueDateFor(close, card.dueDay);
      if (due >= today) break;
      const owed =
        charges.filter((t) => t.occurredOn <= close).reduce((sum, t) => sum + t.amountMinor, 0) -
        payments.filter((p) => p.paidOn <= close).reduce((sum, p) => sum + p.amountMinor, 0);
      if (owed <= 0) continue;
      const payment = { cardId: card.id, amountMinor: owed, paidOn: due, note: DEMO_NOTE };
      tx.insert(cardPayments).values(payment).run();
      payments.push({ ...payment, id: 0, createdAt: new Date() });
    }
  }
});
console.log(`seed:demo: ${demoPlans.length} demo installment plans written`);
console.log(`seed:demo: ${values.length} demo transactions written (${MONTHS} months up to ${today}); previous demo rows replaced`);
