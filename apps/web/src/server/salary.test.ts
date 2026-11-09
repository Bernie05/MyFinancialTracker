/**
 * My Salary and the dashboard's range summary through the real routes: saving replaces the deductions,
 * each account sees only its own salary, bad input is refused, and a range sums whole months.
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

const salary = {
  basis: "monthly",
  grossMinor: 50_000_00,
  deductions: [
    { kind: "tax", name: "Withholding tax", amountMinor: 4_568_33 },
    { kind: "sss", name: "SSS", amountMinor: 1_750_00 },
    { kind: "philhealth", name: "PhilHealth", amountMinor: 1_250_00 },
    { kind: "pagibig", name: "Pag-IBIG", amountMinor: 200_00 },
    { kind: "other", name: "HMO", amountMinor: 500_00 },
  ],
};

test("set up, read back and replace your salary", async () => {
  const call = await user("earner@example.com");
  expect((await call("GET", "/api/salary")).body).toEqual({ profile: null });

  const saved = await call("PUT", "/api/salary", salary);
  expect(saved.status).toBe(200);
  expect(saved.body.profile).toEqual(salary);
  expect((await call("GET", "/api/salary")).body.profile).toEqual(salary);

  // Saving again replaces everything: now per year, and the HMO is gone.
  const annual = { basis: "annual", grossMinor: 720_000_00, deductions: salary.deductions.slice(0, 4) };
  expect((await call("PUT", "/api/salary", annual)).body.profile).toEqual(annual);
  expect((await call("GET", "/api/salary")).body.profile.deductions).toHaveLength(4);
});

test("another account never sees your salary", async () => {
  const a = await user("a-salary@example.com");
  const b = await user("b-salary@example.com");
  await a("PUT", "/api/salary", salary);
  expect((await b("GET", "/api/salary")).body).toEqual({ profile: null });
});

test("refuses deductions above the gross pay, duplicates and bad amounts", async () => {
  const call = await user("strict-salary@example.com");
  const tooMuch = await call("PUT", "/api/salary", { basis: "monthly", grossMinor: 10_000_00, deductions: [{ kind: "other", name: "Loan", amountMinor: 10_000_01 }] });
  expect(tooMuch.status).toBe(400);
  expect(tooMuch.body.error.fields.deductions).toContain("more than the gross pay");

  const twice = await call("PUT", "/api/salary", { ...salary, deductions: [salary.deductions[1], salary.deductions[1]] });
  expect(twice.status).toBe(400);

  expect((await call("PUT", "/api/salary", { ...salary, grossMinor: 0 })).status).toBe(400);
  expect((await call("PUT", "/api/salary", { ...salary, deductions: [{ kind: "sss", name: "SSS", amountMinor: -1 }] })).status).toBe(400);
  expect((await call("GET", "/api/salary")).body).toEqual({ profile: null });
});

test("a range summary sums whole months, both ends included", async () => {
  const call = await user("ranger@example.com");
  const categories = (await call("GET", "/api/categories")).body as { id: number; type: string; parentId: number | null }[];
  const expense = categories.find((c) => c.type === "expense" && c.parentId === null)!.id;
  const income = categories.find((c) => c.type === "income" && c.parentId === null)!.id;
  const add = (type: string, categoryId: number, amountMinor: number, occurredOn: string) =>
    call("POST", "/api/transactions", { type, categoryId, amountMinor, occurredOn, description: "x", note: null, cardId: null, split: null });
  await add("income", income, 30_000_00, "2026-01-15");
  await add("expense", expense, 1_000_00, "2026-01-31");
  await add("expense", expense, 2_000_00, "2026-03-01");
  await add("expense", expense, 4_000_00, "2026-04-01"); // outside Q1

  const q1 = await call("GET", "/api/summary/range?from=2026-01&to=2026-03");
  expect(q1.status).toBe(200);
  expect(q1.body).toMatchObject({ from: "2026-01", to: "2026-03", incomeMinor: 30_000_00, expenseMinor: 3_000_00, netMinor: 27_000_00 });
  expect(q1.body.expenseByCategory[0].totalMinor).toBe(3_000_00);

  expect((await call("GET", "/api/summary/range?from=2026-01&to=2026-12")).body.expenseMinor).toBe(7_000_00);
  expect((await call("GET", "/api/summary/range?from=2026-05&to=2026-01")).status).toBe(400);
  // The yearly chart asks for five years of months.
  expect((await call("GET", "/api/summary/monthly?to=2026-12&months=60")).body).toHaveLength(60);
});
