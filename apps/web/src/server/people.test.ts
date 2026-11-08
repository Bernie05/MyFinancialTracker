/**
 * People and splits through the real routes: shares are stored to the centavo, reports count only your
 * share, balances follow charges and repayments, and the "For" column of the Excel import maps to splits.
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

const groceries = async (call: Awaited<ReturnType<typeof user>>) =>
  (await call("GET", "/api/categories")).body.find((c: { type: string; parentId: number | null }) => c.type === "expense" && c.parentId === null).id;

test("split a charge, count only your share, track and repay what they owe", async () => {
  const call = await user("splitter@example.com");
  const ana = (await call("POST", "/api/people", { name: "Ana" })).body;
  const ben = (await call("POST", "/api/people", { name: "Ben" })).body;
  expect((await call("POST", "/api/people", { name: "ana" })).status).toBe(409); // names are unique, any case
  const categoryId = await groceries(call);

  // ₱1,000.01 three ways: 333.34 / 333.34 / 333.33 → you, Ana, Ben.
  const dinner = await call("POST", "/api/transactions", {
    type: "expense",
    amountMinor: 100001,
    description: "Dinner",
    categoryId,
    occurredOn: "2026-10-05",
    split: { mode: "equal", parts: [{ personId: null, value: 0 }, { personId: ana.id, value: 0 }, { personId: ben.id, value: 0 }] },
  });
  expect(dinner.status).toBe(201);
  expect(dinner.body.myShareMinor).toBe(33334);
  expect(dinner.body.shares.map((s: { name: string; amountMinor: number }) => [s.name, s.amountMinor])).toEqual([["Ana", 33334], ["Ben", 33333]]);

  // All Ana's: your share is 0.
  await call("POST", "/api/transactions", {
    type: "expense", amountMinor: 50000, description: "Ana's shoes", categoryId, occurredOn: "2026-10-06",
    split: { mode: "equal", parts: [{ personId: ana.id, value: 1 }] },
  });

  const summary = (await call("GET", "/api/summary?month=2026-10")).body;
  expect(summary.expenseMinor).toBe(33334);

  const people = (await call("GET", "/api/people")).body;
  expect(people.find((p: { name: string }) => p.name === "Ana").balanceMinor).toBe(83334);

  // Exact amounts must add up.
  const bad = await call("PATCH", `/api/transactions/${dinner.body.id}`, { split: { mode: "amounts", parts: [{ personId: null, value: 50000 }, { personId: ana.id, value: 10000 }] } });
  expect(bad.status).toBe(400);
  expect(bad.body.error.fields.split).toContain("add up");
  const good = await call("PATCH", `/api/transactions/${dinner.body.id}`, { split: { mode: "shares", parts: [{ personId: null, value: 2 }, { personId: ana.id, value: 1 }] } });
  expect(good.body.myShareMinor).toBe(66667);
  expect(good.body.shares).toEqual([{ personId: ana.id, name: "Ana", amountMinor: 33334 }]);

  // Repayment lowers the balance; someone with history is archived, not deleted.
  expect((await call("POST", `/api/people/${ana.id}/payments`, { amountMinor: 30000, paidOn: "2026-10-10" })).status).toBe(201);
  const detail = (await call("GET", `/api/people/${ana.id}`)).body;
  expect(detail.chargedMinor).toBe(83334);
  expect(detail.repaidMinor).toBe(30000);
  expect(detail.balanceMinor).toBe(53334);
  expect(detail.shares).toHaveLength(2);
  expect((await call("DELETE", `/api/people/${ana.id}`)).status).toBe(409);
  // Ben no longer has a share (the dinner was re-split), so he can be deleted.
  expect((await call("DELETE", `/api/people/${ben.id}`)).status).toBe(204);

  // Income can't be split.
  const income = await call("POST", "/api/transactions", {
    type: "income", amountMinor: 1000, description: "x", categoryId: (await call("GET", "/api/categories")).body.find((c: { type: string }) => c.type === "income").id,
    occurredOn: "2026-10-01", split: { mode: "equal", parts: [{ personId: ana.id, value: 1 }] },
  });
  expect(income.status).toBe(400);
});

test("installment plans split every billed month; a card's usual person is checked", async () => {
  const call = await user("plans@example.com");
  const cy = (await call("POST", "/api/people", { name: "Cy" })).body;
  const card = (await call("POST", "/api/cards", { name: "Shared Card", limitMinor: 10_000_000, closingDay: 5, dueDay: 25, color: "blue", defaultPersonId: cy.id })).body;
  expect(card.defaultPersonId).toBe(cy.id);
  expect((await call("POST", "/api/cards", { name: "Other", limitMinor: 1000, closingDay: 5, dueDay: 25, color: "red", defaultPersonId: 999 })).status).toBe(400);

  const categoryId = await groceries(call);
  const plan = await call("POST", `/api/cards/${card.id}/installments`, {
    description: "Phone", categoryId, purchasedOn: "2026-01-10", principalMinor: 1_200_000, months: 12, addOnRateBps: 0,
    split: { mode: "amounts", parts: [{ personId: null, value: 300_000 }, { personId: cy.id, value: 900_000 }] },
  });
  expect(plan.status).toBe(201);
  const months = (await call("GET", `/api/transactions?installment=only&pageSize=100`)).body.items;
  expect(months.length).toBeGreaterThan(0);
  for (const m of months) {
    expect(m.myShareMinor).toBe(25_000); // a quarter of each ₱1,000 bill
    expect(m.shares[0].amountMinor).toBe(75_000);
  }
  const cyNow = (await call("GET", `/api/people/${cy.id}`)).body;
  expect(cyNow.balanceMinor).toBe(75_000 * months.length);
  // Straight vs installment, and what's still to come on the plan.
  expect(cyNow.straightMinor).toBe(0);
  expect(cyNow.installmentBilledMinor).toBe(75_000 * months.length);
  expect(cyNow.monthlyMinor).toBe(75_000);
  expect(cyNow.upcomingMinor).toBe(75_000 * (12 - months.length));
  expect(cyNow.toPayOffMinor).toBe(900_000); // their whole ₱9,000 part of the plan
  expect(cyNow.plans).toHaveLength(1);
  expect(cyNow.plans[0]).toMatchObject({ description: "Phone", months: 12, monthsBilled: months.length, monthlyMinor: 75_000, cardName: "Shared Card" });

  // A straight charge on top shows up separately.
  await call("POST", "/api/transactions", {
    type: "expense", amountMinor: 20_000, description: "Lunch", categoryId, occurredOn: "2026-10-02", split: { mode: "equal", parts: [{ personId: cy.id, value: 1 }] },
  });
  const listed = (await call("GET", "/api/people")).body.find((p: { id: number }) => p.id === cy.id);
  expect(listed.straightMinor).toBe(20_000);
  expect(listed.toPayOffMinor).toBe(920_000);
  expect(listed.activePlans).toBe(1);
});

test("Excel 'For' column: names, styles, new people, and a card's usual person", async () => {
  const call = await user("forcol@example.com");
  const dee = (await call("POST", "/api/people", { name: "Dee" })).body;
  await call("POST", "/api/cards", { name: "Dee Card", limitMinor: 10_000_000, closingDay: 5, dueDay: 25, color: "green", defaultPersonId: dee.id });
  const row = (n: number, extra: Record<string, unknown>) => ({ row: n, date: "2026-10-01", description: `Row ${n}`, amount: 100, category: "Groceries", ...extra });

  const res = await call("POST", "/api/import", {
    commit: true,
    installments: [],
    transactions: [
      row(2, { for: "Me, Dee" }),
      row(3, { for: "Me:3, Eve:1" }), // Eve is new
      row(4, { for: "me=40, dee=60" }),
      row(5, { card: "Dee Card" }), // no "for" key at all, as when the sheet has no For column
    ],
  });
  expect(res.body.errors).toEqual([]);
  expect(res.body.newPeople).toEqual(["Eve"]);
  const items = (await call("GET", "/api/export")).body.transactions;
  const by = (d: string) => items.find((t: { description: string }) => t.description === d);
  expect(by("Row 2").myShareMinor).toBe(5000);
  expect(by("Row 3").myShareMinor).toBe(7500);
  expect(by("Row 4").shares[0]).toMatchObject({ name: "Dee", amountMinor: 6000 });
  expect(by("Row 5").myShareMinor).toBe(0); // Dee Card's usual person
  expect(by("Row 5").shares[0].name).toBe("Dee");

  const bad = await call("POST", "/api/import", { commit: false, installments: [], transactions: [row(2, { for: "Me=10, Dee=20" }), row(3, { for: "Me, Dee:2" })] });
  expect(bad.body.errors.map((e: { row: number }) => e.row)).toEqual([2, 3]);
});

test("billings: grouped by statement, paid oldest first, past-due carries into the next billing", async () => {
  const call = await user("billings@example.com");
  const fay = (await call("POST", "/api/people", { name: "Fay" })).body;
  const card = (await call("POST", "/api/cards", { name: "Bill Card", limitMinor: 10_000_000, closingDay: 5, dueDay: 25, color: "pink" })).body;
  const categoryId = await groceries(call);
  const charge = (amountMinor: number, occurredOn: string) =>
    call("POST", "/api/transactions", {
      type: "expense", amountMinor, description: `On ${occurredOn}`, categoryId, occurredOn, cardId: card.id,
      split: { mode: "equal", parts: [{ personId: fay.id, value: 1 }] },
    });
  await charge(10_000, "2026-01-10"); // statement Feb 5, due Feb 25: past due
  await charge(20_000, "2026-02-10"); // due Mar 25: past due
  await charge(30_000, "2099-01-10"); // due 2099-02-25: not yet

  let p = (await call("GET", `/api/people/${fay.id}`)).body;
  const byDue = (d: string) => p.billings.find((b: { dueDate: string }) => b.dueDate === d);
  expect(p.billings.map((b: { dueDate: string }) => b.dueDate)).toEqual(["2026-02-25", "2026-03-25", "2099-02-25"]); // oldest first
  expect(byDue("2026-02-25")).toMatchObject({ status: "unpaid", remainingMinor: 10_000, movedTo: "2099-02-25", closeDate: "2026-02-05" });
  expect(byDue("2099-02-25")).toMatchObject({ status: "due", carriedInMinor: 30_000, payMinor: 60_000 });
  expect(p.overdueMinor).toBe(30_000);
  expect(p.nextDue).toEqual({ dueDate: "2099-02-25", amountMinor: 60_000 });

  // A ₱150 repayment settles the oldest first: Feb paid, Mar ₱50 paid and still past due.
  await call("POST", `/api/people/${fay.id}/payments`, { amountMinor: 15_000, paidOn: "2026-04-01" });
  p = (await call("GET", `/api/people/${fay.id}`)).body;
  expect(byDue("2026-02-25").status).toBe("paid");
  expect(byDue("2026-03-25")).toMatchObject({ status: "unpaid", paidMinor: 5_000, remainingMinor: 15_000 });
  expect(byDue("2099-02-25").payMinor).toBe(45_000);

  // "Paid" on the latest billing pays it plus everything before it.
  await call("POST", `/api/people/${fay.id}/payments`, { amountMinor: byDue("2099-02-25").payMinor, paidOn: "2026-04-02", note: "Paid: billing due 2099-02-25" });
  p = (await call("GET", `/api/people/${fay.id}`)).body;
  expect(p.billings.every((b: { status: string }) => b.status === "paid")).toBe(true);
  expect(p.balanceMinor).toBe(0);
  expect(p.overdueMinor).toBe(0);
});

test("billings include installment months not billed yet, and paying ahead settles them", async () => {
  const call = await user("ahead@example.com");
  const gus = (await call("POST", "/api/people", { name: "Gus" })).body;
  const card = (await call("POST", "/api/cards", { name: "Ahead Card", limitMinor: 10_000_000, closingDay: 5, dueDay: 25, color: "teal" })).body;
  const categoryId = await groceries(call);
  // Bought far in the future: all 3 months are still to come.
  await call("POST", `/api/cards/${card.id}/installments`, {
    description: "Fan", categoryId, purchasedOn: "2099-01-10", principalMinor: 300_000, months: 3, addOnRateBps: 0,
    split: { mode: "equal", parts: [{ personId: gus.id, value: 1 }] },
  });
  let p = (await call("GET", `/api/people/${gus.id}`)).body;
  expect(p.billings).toHaveLength(3);
  expect(p.billings.every((b: { items: { upcoming: boolean }[] }) => b.items.every((i) => i.upcoming))).toBe(true);
  expect(p.billings[0].items[0].description).toBe("Fan (1/3)");
  expect(p.billings.map((b: { payMinor: number }) => b.payMinor)).toEqual([100_000, 200_000, 300_000]);
  expect(p.nextDue.amountMinor).toBe(100_000);

  // Paid all = everything, including months not billed yet.
  const owing = p.billings.reduce((sum: number, b: { remainingMinor: number }) => sum + b.remainingMinor, 0);
  expect(owing).toBe(p.toPayOffMinor);
  await call("POST", `/api/people/${gus.id}/payments`, { amountMinor: owing, paidOn: "2026-11-08", note: "Paid all billed" });
  p = (await call("GET", `/api/people/${gus.id}`)).body;
  expect(p.billings.every((b: { status: string }) => b.status === "paid")).toBe(true);
  expect(p.toPayOffMinor).toBe(0);
  expect(p.balanceMinor).toBe(-300_000); // paid in advance
});

