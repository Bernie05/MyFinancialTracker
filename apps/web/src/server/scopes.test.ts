/**
 * The sidebar's sections through the real routes: card type (bank card or online credit), the
 * Cash & Others filter (no card) and the Other Income filter (everything but one category tree).
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


test("cards are bank cards unless made online credit, and the type can change", async () => {
  const call = await user("kinds@example.com");
  const base = { name: "BPI Gold", limitMinor: 100_000_00, closingDay: 5, dueDay: 25, color: "red" };
  const bank = await call("POST", "/api/cards", base);
  expect(bank.status).toBe(201);
  expect(bank.body.kind).toBe("bank");
  const online = await call("POST", "/api/cards", { ...base, name: "SPayLater", color: "orange", kind: "online", issuer: "Shopee" });
  expect(online.body.kind).toBe("online");
  expect((await call("PATCH", `/api/cards/${bank.body.id}`, { kind: "online" })).body.kind).toBe("online");
  expect((await call("POST", "/api/cards", { ...base, name: "X", color: "blue", kind: "store" })).status).toBe(400);
});

test("Cash & Others lists only non-card expenses; Other Income leaves out a category and its subcategories", async () => {
  const call = await user("scopes@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; name: string; type: string; parentId: number | null }[];
  const groceries = categories.find((c) => c.name === "Groceries")!.id;
  const salary = categories.find((c) => c.name === "Salary")!.id;
  const freelance = categories.find((c) => c.name === "Freelance")!.id;
  const bonus = (await call("POST", "/api/categories", { name: "Bonus", type: "income", parentId: salary })).body.id;
  const card = (await call("POST", "/api/cards", { name: "BPI", limitMinor: 100_000_00, closingDay: 5, dueDay: 25, color: "red" })).body.id;
  const add = (type: string, categoryId: number, amountMinor: number, cardId: number | null = null) =>
    call("POST", "/api/transactions", { type, categoryId, amountMinor, occurredOn: "2026-10-10", description: "x", note: null, cardId, split: null });
  await add("expense", groceries, 100_00);
  await add("expense", groceries, 200_00, card);
  await add("income", salary, 50_000_00);
  await add("income", bonus, 5_000_00);
  await add("income", freelance, 3_000_00);

  const cash = await call("GET", "/api/transactions?type=expense&paidWith=cash");
  expect(cash.body.total).toBe(1);
  expect(cash.body.expenseMinor).toBe(100_00);
  expect((await call("GET", "/api/transactions?type=expense")).body.total).toBe(2);

  const other = await call("GET", `/api/transactions?type=income&excludeCategoryId=${salary}`);
  expect(other.body.total).toBe(1);
  expect(other.body.incomeMinor).toBe(3_000_00);
  expect((await call("GET", "/api/transactions?type=expense&paidWith=card")).status).toBe(400);
});

test("monthly totals split by how it was paid and by category tree", async () => {
  const call = await user("overview@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; name: string }[];
  const groceries = categories.find((c) => c.name === "Groceries")!.id;
  const salary = categories.find((c) => c.name === "Salary")!.id;
  const freelance = categories.find((c) => c.name === "Freelance")!.id;
  const card = (body: object) => call("POST", "/api/cards", { limitMinor: 100_000_00, closingDay: 5, dueDay: 25, ...body });
  const bpi = (await card({ name: "BPI", color: "red" })).body.id;
  const spay = (await card({ name: "SPayLater", color: "orange", kind: "online" })).body.id;
  const add = (type: string, categoryId: number, amountMinor: number, cardId: number | null = null) =>
    call("POST", "/api/transactions", { type, categoryId, amountMinor, occurredOn: "2026-10-10", description: "x", note: null, cardId, split: null });
  await add("expense", groceries, 100_00);
  await add("expense", groceries, 200_00, bpi);
  await add("expense", groceries, 400_00, spay);
  await add("income", salary, 50_000_00);
  await add("income", freelance, 3_000_00);

  const october = async (query: string) => (await call("GET", `/api/summary/monthly?to=2026-10&months=1${query}`)).body[0];
  expect((await october("")).expenseMinor).toBe(700_00);
  expect((await october("&paidWith=cash")).expenseMinor).toBe(100_00);
  expect((await october("&paidWith=bank")).expenseMinor).toBe(200_00);
  expect((await october("&paidWith=online")).expenseMinor).toBe(400_00);
  expect((await october(`&categoryId=${salary}`)).incomeMinor).toBe(50_000_00);
  expect((await october(`&excludeCategoryId=${salary}`)).incomeMinor).toBe(3_000_00);
});

test("a loan is a plan marked with its type, and it comes off the account's available credit", async () => {
  const call = await user("loans@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; name: string; type: string }[];
  const shopping = categories.find((c) => c.type === "expense")!.id;
  const account = (await call("POST", "/api/cards", { name: "SLoan", kind: "online", limitMinor: 20_000_00, closingDay: 23, dueDay: 5, color: "orange" })).body;
  expect(account.summary.availableMinor).toBe(20_000_00);

  const today = new Date().toISOString().slice(0, 10);
  const loan = await call("POST", `/api/cards/${account.id}/installments`, {
    description: "Cash loan",
    categoryId: shopping,
    purchasedOn: today,
    principalMinor: 6_000_00,
    months: 6,
    loanType: "online",
  });
  expect(loan.status).toBe(201);
  expect(loan.body.loanType).toBe("online");
  expect(loan.body.monthlyMinor).toBe(1_000_00);
  expect((await call("GET", `/api/cards/${account.id}`)).body.summary.availableMinor).toBe(14_000_00);

  // Ordinary installments stay unmarked; the type can change; unknown types are refused.
  const plain = await call("POST", `/api/cards/${account.id}/installments`, { description: "Phone", categoryId: shopping, purchasedOn: today, principalMinor: 1_000_00, months: 2 });
  expect(plain.body.loanType).toBeNull();
  expect((await call("PATCH", `/api/installments/${loan.body.id}`, { loanType: "personal" })).body.loanType).toBe("personal");
  expect((await call("PATCH", `/api/installments/${loan.body.id}`, { loanType: "mortgage" })).status).toBe(400);
});

test("an account with history is refused by a plain delete, and deleted with all of it when asked", async () => {
  const call = await user("delete-history@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; type: string }[];
  const expense = categories.find((c) => c.type === "expense")!.id;
  const account = (await call("POST", "/api/cards", { name: "Test1", kind: "online", limitMinor: 100_000_00, closingDay: 1, dueDay: 12, color: "red" })).body;
  const charge = await call("POST", "/api/transactions", { type: "expense", amountMinor: 1_000_00, description: "Charge", categoryId: expense, occurredOn: "2026-10-05", cardId: account.id });
  expect(charge.status).toBe(201);
  await call("POST", `/api/cards/${account.id}/installments`, { description: "Loan", categoryId: expense, purchasedOn: "2026-06-01", principalMinor: 3_000_00, months: 3, loanType: "online" });
  await call("POST", `/api/cards/${account.id}/payments`, { amountMinor: 500_00, paidOn: "2026-10-20" });

  expect((await call("DELETE", `/api/cards/${account.id}`)).status).toBe(409);
  expect((await call("DELETE", `/api/cards/${account.id}?history=delete`)).status).toBe(204);
  expect((await call("GET", `/api/cards/${account.id}`)).status).toBe(404);
  const left = (await call("GET", "/api/transactions?type=expense&from=2026-01-01&to=2026-12-31")).body;
  expect(left.items.filter((t: { description: string }) => t.description.startsWith("Charge") || t.description.startsWith("Loan"))).toHaveLength(0);
});

test("budgets: one standing amount per top-level expense category, yours only, cleared with null", async () => {
  const call = await user("budgets@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; name: string; type: string; parentId: number | null }[];
  const groceries = categories.find((c) => c.name === "Groceries")!.id;
  const salary = categories.find((c) => c.name === "Salary")!.id;
  const sub = (await call("POST", "/api/categories", { name: "Veggies", type: "expense", parentId: groceries })).body.id;

  expect((await call("GET", "/api/budgets")).body).toEqual([]);
  expect((await call("PUT", `/api/budgets/${groceries}`, { limitMinor: 5_000_00 })).body).toEqual([{ categoryId: groceries, limitMinor: 5_000_00 }]);
  // Setting it again replaces it.
  expect((await call("PUT", `/api/budgets/${groceries}`, { limitMinor: 6_000_00 })).body).toEqual([{ categoryId: groceries, limitMinor: 6_000_00 }]);
  expect((await call("PUT", `/api/budgets/${salary}`, { limitMinor: 1_00 })).status).toBe(400);
  expect((await call("PUT", `/api/budgets/${sub}`, { limitMinor: 1_00 })).status).toBe(400);
  expect((await call("PUT", `/api/budgets/${groceries}`, { limitMinor: 0 })).status).toBe(400);

  // Another user can't see or set it.
  const other = await user("budgets-other@example.com");
  expect((await other("GET", "/api/budgets")).body).toEqual([]);
  expect((await other("PUT", `/api/budgets/${groceries}`, { limitMinor: 1_00 })).status).toBe(404);

  expect((await call("PUT", `/api/budgets/${groceries}`, { limitMinor: null })).body).toEqual([]);
});

test("monthly budget: one main amount per user, replaced on set, cleared with null", async () => {
  const call = await user("monthly-budget@example.com");
  expect((await call("GET", "/api/monthly-budget")).body).toEqual({ limitMinor: null });
  expect((await call("PUT", "/api/monthly-budget", { limitMinor: 20_000_00 })).body).toEqual({ limitMinor: 20_000_00 });
  expect((await call("PUT", "/api/monthly-budget", { limitMinor: 25_000_00 })).body).toEqual({ limitMinor: 25_000_00 });
  expect((await call("PUT", "/api/monthly-budget", { limitMinor: 0 })).status).toBe(400);


  expect((await call("PUT", "/api/monthly-budget", { limitMinor: null })).body).toEqual({ limitMinor: null });
});

test("cash cards: a pick of top-level expense categories; removing one keeps the category and drops its budget", async () => {
  const call = await user("cash-cards@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; name: string }[];
  const groceries = categories.find((c) => c.name === "Groceries")!.id;
  const salary = categories.find((c) => c.name === "Salary")!.id;
  const sub = (await call("POST", "/api/categories", { name: "Snacks", type: "expense", parentId: groceries })).body.id;

  expect((await call("GET", "/api/cash-cards")).body).toEqual([]);
  expect((await call("POST", "/api/cash-cards", { categoryId: groceries })).body).toEqual([{ categoryId: groceries }]);
  // Adding it again changes nothing.
  expect((await call("POST", "/api/cash-cards", { categoryId: groceries })).body).toEqual([{ categoryId: groceries }]);
  expect((await call("POST", "/api/cash-cards", { categoryId: salary })).status).toBe(400);
  expect((await call("POST", "/api/cash-cards", { categoryId: sub })).status).toBe(400);

  // Another user can't see or touch it.
  const other = await user("cash-cards-other@example.com");
  expect((await other("GET", "/api/cash-cards")).body).toEqual([]);
  expect((await other("POST", "/api/cash-cards", { categoryId: groceries })).status).toBe(404);
  expect((await other("DELETE", `/api/cash-cards/${groceries}`)).status).toBe(404);

  await call("PUT", `/api/budgets/${groceries}`, { limitMinor: 3_000_00 });
  expect((await call("DELETE", `/api/cash-cards/${groceries}`)).body).toEqual([]);
  expect((await call("GET", "/api/budgets")).body).toEqual([]);
  expect(((await call("GET", "/api/categories")).body as { id: number }[]).some((c) => c.id === groceries)).toBe(true);
});
