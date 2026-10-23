/**
 * End to end through the real routes and security gate, on an in-memory database:
 * user B must not be able to read, change or delete anything of user A's (404, never 403),
 * and the gate must refuse anonymous and cross-site requests.
 */
import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { createAppRoutes, MAX_REQUEST_BODY } from "./app";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrations";

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  const db = createDb(":memory:");
  runMigrations(db);
  server = Bun.serve({ port: 0, routes: createAppRoutes(db), maxRequestBodySize: MAX_REQUEST_BODY });
  base = server.url.origin;
});
afterAll(() => server.stop(true));

/** A tiny client that keeps the session cookie, like a browser would. */
function client() {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { Origin: base, ...(body !== undefined && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  /** Register (which never signs in) and then sign in, like the app does. */
  const signUp = async (email: string, password: string) => {
    expect((await call("POST", "/api/auth/register", { email, password })).status).toBe(202);
    return call("POST", "/api/auth/login", { email, password });
  };
  return { call, signUp, cookie: () => cookie };
}

test("users can't see or touch each other's data", async () => {
  const a = client();
  const b = client();
  expect((await a.signUp("alice@example.com", "alice long password")).status).toBe(200);
  expect((await b.signUp("bob@example.com", "bobs long password")).status).toBe(200);

  // A's data: a category, a card, a charge on it, a payment and an installment plan.
  const aCats = (await a.call("GET", "/api/categories")).body as { id: number; type: string; name: string }[];
  expect(aCats.length).toBe(9); // defaults seeded on registration
  const cat = aCats.find((c) => c.type === "expense")!;
  const card = (await a.call("POST", "/api/cards", { name: "A card", limitMinor: 1_000_000, closingDay: 5, dueDay: 25, color: "blue" })).body;
  const tx = (await a.call("POST", "/api/transactions", { type: "expense", amountMinor: 1000, description: "A lunch", categoryId: cat.id, occurredOn: "2026-10-01", cardId: card.id })).body;
  const pay = (await a.call("POST", `/api/cards/${card.id}/payments`, { amountMinor: 500, paidOn: "2026-10-02" })).body;
  const plan = (await a.call("POST", `/api/cards/${card.id}/installments`, { description: "A phone", categoryId: cat.id, purchasedOn: "2026-09-01", principalMinor: 300_000, months: 3 })).body;
  expect([card.id, tx.id, pay.id, plan.id].every(Number.isInteger)).toBe(true);

  // B gets 404 for every one of A's ids, on read, update and delete.
  const attempts: [string, string, unknown?][] = [
    ["GET", `/api/cards/${card.id}`],
    ["PATCH", `/api/cards/${card.id}`, { name: "Mine now" }],
    ["DELETE", `/api/cards/${card.id}`],
    ["GET", `/api/cards/${card.id}/payments`],
    ["POST", `/api/cards/${card.id}/payments`, { amountMinor: 1, paidOn: "2026-10-03" }],
    ["DELETE", `/api/cards/${card.id}/payments/${pay.id}`],
    ["GET", `/api/cards/${card.id}/installments`],
    ["POST", `/api/cards/${card.id}/installments`, { description: "x", categoryId: cat.id, purchasedOn: "2026-10-01", principalMinor: 100, months: 1 }],
    ["GET", `/api/installments/${plan.id}`],
    ["PATCH", `/api/installments/${plan.id}`, { description: "Mine now" }],
    ["DELETE", `/api/installments/${plan.id}`],
    ["PATCH", `/api/transactions/${tx.id}`, { description: "Mine now" }],
    ["DELETE", `/api/transactions/${tx.id}`],
    ["PATCH", `/api/categories/${cat.id}`, { name: "Mine now" }],
    ["DELETE", `/api/categories/${cat.id}`],
  ];
  for (const [method, path, body] of attempts) {
    const res = await b.call(method, path, body);
    expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 });
  }

  // B can't attach A's category or card to its own data either.
  const bCat = ((await b.call("GET", "/api/categories")).body as { id: number; type: string }[]).find((c) => c.type === "expense")!;
  expect((await b.call("POST", "/api/transactions", { type: "expense", amountMinor: 1, description: "x", categoryId: cat.id, occurredOn: "2026-10-01" })).status).toBe(400);
  expect((await b.call("POST", "/api/transactions", { type: "expense", amountMinor: 1, description: "x", categoryId: bCat.id, occurredOn: "2026-10-01", cardId: card.id })).status).toBe(400);

  // Paths where B passes one of A's ids inside a write to B's own data (audit hardening note).
  const bCatWithTx = (await b.call("POST", "/api/categories", { name: "B things", type: "expense", color: "#123456" })).body;
  expect(bCatWithTx.id).toBeNumber();
  await b.call("POST", "/api/transactions", { type: "expense", amountMinor: 1, description: "b", categoryId: bCatWithTx.id, occurredOn: "2026-10-01" });
  const bCard = (await b.call("POST", "/api/cards", { name: "B card", limitMinor: 100_000, closingDay: 1, dueDay: 20, color: "red" })).body;
  expect((await b.call("PATCH", `/api/categories/${bCatWithTx.id}`, { parentId: cat.id })).status).toBe(400); // A's category as parent
  expect((await b.call("DELETE", `/api/categories/${bCatWithTx.id}?moveTo=${cat.id}`)).status).toBe(400); // move into A's category
  expect(
    (await b.call("POST", `/api/cards/${bCard.id}/installments`, { description: "x", categoryId: cat.id, purchasedOn: "2026-10-01", principalMinor: 100, months: 1 }))
      .status,
  ).toBe(400); // installment in A's category
  expect((await b.call("GET", `/api/categories`)).body.some((c: { id: number }) => c.id === bCatWithTx.id)).toBe(true); // B's still there

  // B's lists show none of A's rows.
  const bTx = (await b.call("GET", "/api/transactions?pageSize=100")).body;
  expect(bTx.items.some((t: { id: number }) => t.id === tx.id)).toBe(false);
  expect(((await b.call("GET", "/api/cards")).body as { id: number }[]).map((c) => c.id)).toEqual([bCard.id]);
  expect((await b.call("GET", "/api/alerts")).body).toEqual([]);
  expect(((await b.call("GET", "/api/categories")).body as { id: number }[]).some((c) => c.id === cat.id)).toBe(false);
  expect((await b.call("GET", "/api/summary?month=2026-10")).body.expenseMinor).toBe(1); // only B's own ₱0.01

  // And A's data is untouched.
  expect((await a.call("GET", `/api/cards/${card.id}`)).body.name).toBe("A card");
  expect((await a.call("GET", `/api/installments/${plan.id}`)).body.description).toBe("A phone");
  expect((await a.call("GET", `/api/cards/${card.id}/payments`)).body).toHaveLength(1);
  expect((await a.call("GET", "/api/transactions?pageSize=100")).body.items.some((t: { id: number }) => t.id === tx.id)).toBe(true);
});

test("the gate: 401 without a session, CSRF checks, headers, login/logout and rotation", async () => {
  const anon = client();
  expect((await anon.call("GET", "/api/transactions")).status).toBe(401);
  expect((await anon.call("GET", "/api/auth/me")).status).toBe(401);
  expect((await anon.call("GET", "/api/health")).status).toBe(200);

  const c = client();
  await c.signUp("Carol@Example.com", "carols long password");
  const first = c.cookie();
  expect((await c.call("GET", "/api/auth/me")).body.user.email).toBe("carol@example.com");

  // Cross-site write refused; non-JSON body refused.
  expect((await c.call("POST", "/api/categories", { name: "X", type: "expense", color: "red" }, { Origin: "https://evil.example" })).status).toBe(403);
  const form = await fetch(`${base}/api/categories`, { method: "POST", headers: { Cookie: c.cookie(), "Content-Type": "application/x-www-form-urlencoded", Origin: base }, body: "name=X" });
  expect(form.status).toBe(415);

  // Headers on API responses.
  const me = await c.call("GET", "/api/auth/me");
  expect(me.headers.get("x-content-type-options")).toBe("nosniff");
  expect(me.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");

  // Same generic message for a wrong password and an unknown email.
  const wrong = await anon.call("POST", "/api/auth/login", { email: "carol@example.com", password: "nope nope nope" });
  const unknown = await anon.call("POST", "/api/auth/login", { email: "nobody@example.com", password: "nope nope nope" });
  expect([wrong.status, unknown.status]).toEqual([401, 401]);
  expect(wrong.body.error.message).toBe(unknown.body.error.message);

  // Login rotates: the old token stops working.
  expect((await c.call("POST", "/api/auth/login", { email: "CAROL@example.com", password: "carols long password" })).status).toBe(200);
  expect(c.cookie()).not.toBe(first);
  const old = await fetch(`${base}/api/auth/me`, { headers: { Cookie: first } });
  expect(old.status).toBe(401);

  // Changing the password revokes other sessions, keeps this one.
  const other = client();
  await other.call("POST", "/api/auth/login", { email: "carol@example.com", password: "carols long password" });
  expect((await c.call("POST", "/api/auth/password", { currentPassword: "carols long password", newPassword: "carols new long password" })).status).toBe(204);
  expect((await other.call("GET", "/api/auth/me")).status).toBe(401);
  expect((await c.call("GET", "/api/auth/me")).status).toBe(200);

  // Logout ends the session.
  expect((await c.call("POST", "/api/auth/logout", {})).status).toBe(204);
  expect((await fetch(`${base}/api/auth/me`, { headers: { Cookie: c.cookie() } })).status).toBe(401);
});

test("SEC-3: register answers the same for a new and an existing email, and signs no one in", async () => {
  const x = client();
  const y = client();
  const created = await x.call("POST", "/api/auth/register", { email: "dana@example.com", password: "danas long password" });
  const again = await y.call("POST", "/api/auth/register", { email: "Dana@example.com", password: "someone elses password" });
  expect(created.status).toBe(202);
  expect(again.status).toBe(created.status);
  expect(again.body).toEqual(created.body);
  expect(created.headers.get("set-cookie")).toBeNull();
  expect(again.headers.get("set-cookie")).toBeNull();
  // The existing account is untouched: the first password still works, the second doesn't.
  expect((await x.call("POST", "/api/auth/login", { email: "dana@example.com", password: "danas long password" })).status).toBe(200);
  expect((await y.call("POST", "/api/auth/login", { email: "dana@example.com", password: "someone elses password" })).status).toBe(401);
});

test("SEC-7: a body over 64 KB is refused with 413", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "x@example.com", password: "p".repeat(100 * 1024) }),
  });
  expect(res.status).toBe(413);
});

test("SEC-8: a failed login logs one line, without the password or the email", async () => {
  const info = spyOn(console, "info").mockImplementation(() => {});
  try {
    await client().call("POST", "/api/auth/login", { email: "erin@example.com", password: "my secret guess" });
    const lines = info.mock.calls.map((args) => String(args[0])).filter((l) => l.includes("login_fail"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("my secret guess");
    expect(lines[0]).not.toContain("erin@example.com");
    expect(JSON.parse(lines[0]!)).toMatchObject({ evt: "login_fail", ip: expect.any(String), emailHash: expect.any(String) });
  } finally {
    info.mockRestore();
  }
});
