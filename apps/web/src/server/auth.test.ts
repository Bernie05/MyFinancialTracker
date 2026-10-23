import { expect, test } from "bun:test";
import { createAuthStore, hashPassword, passwordProblem, SESSION_TTL, verifyPassword } from "./auth";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrations";

const DAY = 24 * 60 * 60 * 1000;

function store() {
  const db = createDb(":memory:");
  runMigrations(db);
  return createAuthStore(db);
}

test("passwords: argon2id hash, verify, and the placeholder that can never sign in", async () => {
  const hash = await hashPassword("correct horse battery");
  expect(hash).toStartWith("$argon2id$");
  expect(hash).not.toContain("correct horse battery");
  expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  expect(await verifyPassword("wrong password", hash)).toBe(false);
  expect(await verifyPassword("anything", "!")).toBe(false);
  expect(await verifyPassword("anything", undefined)).toBe(false);
});

test("password rules: length and common passwords", () => {
  expect(passwordProblem("short")).toContain("8 characters");
  expect(passwordProblem("Password1")).toContain("too common");
  expect(passwordProblem("a fine long passphrase")).toBeNull();
});

test("sessions: stored hashed, found by token, expire, slide, and can be revoked", async () => {
  const auth = store();
  const user = await auth.createUser("Me@Example.com ", await hashPassword("a fine long passphrase"));
  expect(user.email).toBe("me@example.com");

  const t0 = Date.parse("2026-10-01T00:00:00Z");
  const { token } = await auth.createSession(user.id, t0);
  expect(token.length).toBeGreaterThanOrEqual(40);

  // Fresh: valid, not renewed yet.
  expect(await auth.findSession(token, t0 + 1000)).toMatchObject({ userId: user.id, renewed: false });
  // After two days of use: the expiry slides forward.
  expect(await auth.findSession(token, t0 + 2 * DAY)).toMatchObject({ renewed: true });
  // ...so it's still valid past the original 30 days (and that use slides it again).
  const lastUse = t0 + SESSION_TTL + DAY;
  expect(await auth.findSession(token, lastUse)).not.toBeNull();
  // Unused for longer than the TTL after its last use: gone, and deleted.
  expect(await auth.findSession(token, lastUse + SESSION_TTL + 1)).toBeNull();
  expect(await auth.findSession(token, lastUse + DAY)).toBeNull();

  // A wrong token never matches.
  expect(await auth.findSession("not-a-real-token")).toBeNull();

  // Revoking others keeps the current one.
  const a = await auth.createSession(user.id);
  const b = await auth.createSession(user.id);
  await auth.deleteOtherSessions(user.id, a.token);
  expect(await auth.findSession(a.token)).not.toBeNull();
  expect(await auth.findSession(b.token)).toBeNull();
  await auth.deleteSession(a.token);
  expect(await auth.findSession(a.token)).toBeNull();
});
