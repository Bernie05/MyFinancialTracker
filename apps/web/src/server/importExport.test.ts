/**
 * Excel import through the real routes on an in-memory database: preview vs commit, name mapping,
 * category creation, update by ID, all-or-nothing on errors, and per-user isolation of IDs.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createAppRoutes, MAX_IMPORT_BODY } from "./app";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrations";

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  const db = createDb(":memory:");
  runMigrations(db);
  server = Bun.serve({ port: 0, routes: createAppRoutes(db), maxRequestBodySize: MAX_IMPORT_BODY });
  base = server.url.origin;
});
afterAll(() => server.stop(true));

async function user(email: string) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { Origin: base, ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  await call("POST", "/api/auth/register", { email, password: "a long test password" });
  await call("POST", "/api/auth/login", { email, password: "a long test password" });
  return call;
}

test("preview, commit, re-import unchanged, update by ID", async () => {
  const call = await user("importer@example.com");
  const card = await call("POST", "/api/cards", { name: "BPI Gold", last4: "4821", limitMinor: 10_000_000, closingDay: 6, dueDay: 27, notifyDays: 5, color: "amber" });
  expect(card.status).toBe(201);

  const rows = {
    transactions: [
      { row: 2, date: "2026-10-01", type: "Expense", description: "Groceries run", amount: 1250.5, category: "Groceries", subcategory: null, card: null, note: null },
      { row: 3, date: "2026-10-02", type: null, description: "New phone case", amount: "₱799.00", category: "Gadgets", subcategory: "Phones", card: "4821", note: "gift" },
      { row: 4, date: "2026-10-03", type: "income", description: "Salary", amount: 50000, category: "Salary", subcategory: null, card: null, note: null },
    ],
    installments: [
      { row: 2, card: "bpi gold", description: "Laptop", category: "Gadgets", subcategory: "Computers", purchasedOn: "2026-09-10", price: 60000, months: 12, rate: 0, monthly: null, fee: null, firstBilled: null, preterminatedOn: null },
    ],
  };

  const preview = await call("POST", "/api/import", { commit: false, ...rows });
  expect(preview.status).toBe(200);
  expect(preview.body.errors).toEqual([]);
  expect(preview.body.committed).toBe(false);
  expect(preview.body.transactions).toEqual({ added: 3, updated: 0, unchanged: 0 });
  expect(preview.body.installments).toEqual({ added: 1, updated: 0, unchanged: 0 });
  expect(preview.body.newCategories.map((c: { path: string }) => c.path)).toEqual(["Gadgets", "Gadgets › Phones", "Gadgets › Computers"]);
  // Nothing written by a preview.
  expect((await call("GET", "/api/export")).body.transactions).toHaveLength(0);

  const done = await call("POST", "/api/import", { commit: true, ...rows });
  expect(done.body.committed).toBe(true);

  const exported = (await call("GET", "/api/export")).body;
  expect(exported.transactions).toHaveLength(3); // billed installment months are not exported
  expect(exported.installments).toHaveLength(1);
  const caseTx = exported.transactions.find((t: { description: string }) => t.description === "New phone case");
  expect(caseTx.amountMinor).toBe(79_900);
  expect(caseTx.card.name).toBe("BPI Gold");
  expect(caseTx.category.name).toBe("Phones");

  // Re-importing what was exported (with IDs) changes nothing; editing one row updates just that row.
  const asRows = exported.transactions.map((t: any, i: number) => ({
    row: i + 2,
    id: t.id,
    date: t.occurredOn,
    type: t.type,
    description: t.description,
    amount: t.amountMinor / 100,
    category: t.category.parentId ? "Gadgets" : t.category.name,
    subcategory: t.category.parentId ? t.category.name : null,
    card: t.card?.name ?? null,
    note: t.note,
  }));
  const again = await call("POST", "/api/import", { commit: false, transactions: asRows, installments: [] });
  expect(again.body.transactions).toEqual({ added: 0, updated: 0, unchanged: 3 });
  expect(again.body.newCategories).toEqual([]);

  asRows[1].amount = 850;
  const edited = await call("POST", "/api/import", { commit: true, transactions: asRows, installments: [] });
  expect(edited.body.transactions).toEqual({ added: 0, updated: 1, unchanged: 2 });
  const after = (await call("GET", "/api/export")).body.transactions.find((t: { id: number }) => t.id === asRows[1].id);
  expect(after.amountMinor).toBe(85_000);
});

test("any error blocks the whole import, with row numbers", async () => {
  const call = await user("errors@example.com");
  const res = await call("POST", "/api/import", {
    commit: true,
    transactions: [
      { row: 2, date: "2026-10-01", description: "Fine", amount: 10, category: "Groceries" },
      { row: 3, date: "10/32/2026", description: "Bad date", amount: 10, category: "Groceries" },
      { row: 4, date: "2026-10-01", description: "Bad amount", amount: "ten", category: "Groceries" },
      { row: 5, date: "2026-10-01", description: "Bad card", amount: 10, category: "Groceries", card: "Nope Card" },
      { row: 6, id: 999999, date: "2026-10-01", description: "Unknown id", amount: 10, category: "Groceries" },
    ],
    installments: [],
  });
  expect(res.status).toBe(200);
  expect(res.body.committed).toBe(false);
  expect(res.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 4, 5, 6]);
  expect(res.body.errors[1].message).toContain("Amount");
  expect((await call("GET", "/api/export")).body.transactions).toHaveLength(0);
});

test("an ID from another user's export is not theirs to update", async () => {
  const a = await user("owner@example.com");
  await a("POST", "/api/import", { commit: true, transactions: [{ row: 2, date: "2026-10-01", description: "Mine", amount: 10, category: "Groceries" }], installments: [] });
  const id = (await a("GET", "/api/export")).body.transactions[0].id;

  const b = await user("intruder@example.com");
  const res = await b("POST", "/api/import", { commit: true, transactions: [{ row: 2, id, date: "2026-10-01", description: "Stolen", amount: 1, category: "Groceries" }], installments: [] });
  expect(res.body.committed).toBe(false);
  expect(res.body.errors[0].message).toContain("isn't one of your transactions");
  expect((await a("GET", "/api/export")).body.transactions[0].description).toBe("Mine");
});

test("other routes still refuse bodies over 64 KB; the import accepts larger ones", async () => {
  const big = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "x@example.com", password: "p".repeat(100 * 1024) }),
  });
  expect(big.status).toBe(413);

  const call = await user("bulk@example.com");
  const transactions = Array.from({ length: 1500 }, (_, i) => ({ row: i + 2, date: "2026-10-01", description: `Row ${i}`, amount: 1, category: "Groceries", note: "x".repeat(40) }));
  const res = await call("POST", "/api/import", { commit: false, transactions, installments: [] });
  expect(res.status).toBe(200);
  expect(res.body.transactions.added).toBe(1500);
});

test("card installment rates: saved sorted, duplicates refused, used when an imported rate is blank", async () => {
  const call = await user("rates@example.com");
  const base = { name: "Rates Card", limitMinor: 10_000_000, closingDay: 10, dueDay: 30, color: "teal" };

  const dup = await call("POST", "/api/cards", { ...base, installmentRates: [{ months: 3, addOnRateBps: 0 }, { months: 3, addOnRateBps: 50 }] });
  expect(dup.status).toBe(400);
  expect(dup.body.error.fields["installmentRates.1.months"]).toContain("twice");

  const created = await call("POST", "/api/cards", { ...base, installmentRates: [{ months: 12, addOnRateBps: 79 }, { months: 3, addOnRateBps: 0 }] });
  expect(created.status).toBe(201);
  expect(created.body.installmentRates).toEqual([{ months: 3, addOnRateBps: 0 }, { months: 12, addOnRateBps: 79 }]);

  // Add, change and remove terms with a PATCH of the whole table.
  const patched = await call("PATCH", `/api/cards/${created.body.id}`, { installmentRates: [{ months: 6, addOnRateBps: 50 }, { months: 12, addOnRateBps: 89 }] });
  expect(patched.body.installmentRates).toEqual([{ months: 6, addOnRateBps: 50 }, { months: 12, addOnRateBps: 89 }]);

  const plan = { row: 2, card: "Rates Card", description: "TV", category: "Shopping", purchasedOn: "2026-10-01", price: 24000, months: 12, rate: null };
  const res = await call("POST", "/api/import", { commit: true, transactions: [], installments: [plan, { ...plan, row: 3, description: "Fan", months: 9 }] });
  expect(res.body.errors).toEqual([]);
  const plans = (await call("GET", "/api/export")).body.installments;
  expect(plans.find((p: { description: string }) => p.description === "TV").addOnRateBps).toBe(89); // the card's 12-month rate
  expect(plans.find((p: { description: string }) => p.description === "Fan").addOnRateBps).toBe(0); // no 9-month rate configured
});
