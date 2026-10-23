import { expect, test } from "bun:test";
import {
  createAuthStore,
  createLoginGuard,
  createRateLimiter,
  hashPassword,
  passwordProblem,
  readSessionToken,
  SESSION_MAX_AGE,
  SESSION_TTL,
  sessionCookie,
  usesLegacyCookie,
  verifyPassword,
} from "./auth";
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

test("SEC-1: a stranger's failed logins never lock the owner out", () => {
  const guard = createLoginGuard();
  const t = Date.parse("2026-10-23T08:00:00Z");
  for (let i = 0; i < 8; i++) {
    expect(guard.before("10.0.0.66", "carol@example.com", t).blocked).toBe(false);
    guard.failed("10.0.0.66", "carol@example.com", t);
  }
  // The stranger's own address is now locked for that email...
  expect(guard.before("10.0.0.66", "carol@example.com", t).blocked).toBe(true);
  // ...but the owner, elsewhere, isn't: at most a short delay, never a refusal.
  const owner = guard.before("192.168.1.5", "carol@example.com", t);
  expect(owner).toEqual({ blocked: false, delayMs: 0 });
  // Many failures from many places only slow things down (capped), they don't block.
  for (let i = 0; i < 100; i++) guard.failed(`10.1.${i}.1`, "carol@example.com", t);
  const slowed = guard.before("192.168.1.5", "carol@example.com", t);
  expect(slowed.blocked).toBe(false);
  expect(slowed.blocked === false && slowed.delayMs).toBe(5_000);
  // A successful login clears that pair.
  guard.succeeded("10.0.0.66", "carol@example.com");
  expect(guard.before("10.0.0.66", "carol@example.com", t).blocked).toBe(false);
});

test("SEC-2: the limiter stays bounded", () => {
  // One IP over its limit adds no email keys: 1,000 attempts with distinct emails, all failing.
  const guard = createLoginGuard();
  const t = Date.parse("2026-10-23T08:00:00Z");
  for (let i = 0; i < 1000; i++) {
    const email = `user${i}@example.com`;
    if (!guard.before("10.0.0.9", email, t).blocked) guard.failed("10.0.0.9", email, t);
  }
  expect(guard.limiter.size()).toBeLessThanOrEqual(1 + 30 * 2); // the IP key + 2 per attempt it allowed

  // And the map never grows past its cap, evicting the oldest entry.
  const small = createRateLimiter(100);
  for (let i = 0; i < 10_000; i++) small.hit(`k${i}`, 60_000, t);
  expect(small.size()).toBe(100);
  expect(small.count("k0", t)).toBe(0);
  expect(small.count("k9999", t)).toBe(1);
});

test("SEC-6: a session ends 90 days after sign-in, however often it's used", async () => {
  const auth = store();
  const user = await auth.createUser("frank@example.com", await hashPassword("franks long password"));
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const { token } = await auth.createSession(user.id, t0);
  // Used every 20 days: still valid at day 80, and its expiry never passes the 90-day cap.
  for (let day = 20; day <= 80; day += 20) {
    const s = await auth.findSession(token, t0 + day * DAY);
    expect(s).not.toBeNull();
    expect(t0 + day * DAY + s!.maxAgeMs).toBeLessThanOrEqual(t0 + SESSION_MAX_AGE);
  }
  // Past the cap: gone, even though the sliding expiry would still be in the future.
  expect(await auth.findSession(token, t0 + SESSION_MAX_AGE + 1)).toBeNull();
  // purgeExpired removes over-age sessions too.
  const old = await auth.createSession(user.id, t0);
  await auth.purgeExpired(t0 + SESSION_MAX_AGE + 1);
  expect(await auth.findSession(old.token, t0 + DAY)).toBeNull();
});

test("SEC-9: __Host- cookie over HTTPS, plain name on http localhost, both readable", () => {
  const https = new Request("https://mft.example.com/api/auth/me");
  const local = new Request("http://localhost:3000/api/auth/me");
  expect(sessionCookie(https, "tok", SESSION_TTL)).toStartWith("__Host-mft_session=tok; Path=/; HttpOnly; SameSite=Lax");
  expect(sessionCookie(https, "tok", SESSION_TTL)).toContain("Secure");
  expect(sessionCookie(local, "tok", SESSION_TTL)).toStartWith("mft_session=tok;");
  expect(sessionCookie(local, "tok", SESSION_TTL)).not.toContain("Secure");
  const withBoth = new Request("https://mft.example.com/", { headers: { cookie: "mft_session=old; __Host-mft_session=new" } });
  expect(readSessionToken(withBoth)).toBe("new");
  const legacy = new Request("https://mft.example.com/", { headers: { cookie: "mft_session=old" } });
  expect(readSessionToken(legacy)).toBe("old");
  expect(usesLegacyCookie(legacy)).toBe(true);
  expect(usesLegacyCookie(withBoth)).toBe(false);
});
