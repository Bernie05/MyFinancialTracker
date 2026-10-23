/**
 * Accounts and sessions.
 *
 * - Passwords: Bun.password (argon2id). Minimum 8 characters, a short list of common passwords refused.
 * - Sessions: a random 256-bit token in an HttpOnly cookie; only its SHA-256 hash is stored, so a copy of
 *   the database can't be replayed as logins. 30-day expiry that slides forward (at most once a day)
 *   while the session is used, capped at 90 days from sign-in. Login always issues a new token.
 * - Rate limits: in memory, bounded, per process (see createRateLimiter and createLoginGuard). Move to the
 *   DB or Redis before running more than one instance (audit SEC-5).
 */
import { and, eq, lt, ne, or } from "drizzle-orm";
import type { Db } from "./db/client";
import { sessions, users } from "./db/schema";

/**
 * Over HTTPS the cookie is `__Host-` prefixed: browsers then refuse it unless it's Secure, Path=/ and has no
 * Domain, so a sibling subdomain or plain-HTTP attacker can't plant one (audit SEC-9). Plain-http localhost
 * can't use Secure, so it keeps the bare name. Both names are read, so switching never strands a session.
 */
export const SESSION_COOKIE = "mft_session";
export const SECURE_SESSION_COOKIE = "__Host-mft_session";
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 30 * DAY;
/** However much a session is used, it ends this long after sign-in (audit SEC-6). */
export const SESSION_MAX_AGE = 90 * DAY;

// ---------- Passwords ----------

/** The usual suspects; enough to stop the worst choices without shipping a huge list. */
const COMMON_PASSWORDS = new Set(
  [
    "password", "password1", "password123", "12345678", "123456789", "1234567890", "11111111", "00000000",
    "qwertyuiop", "qwerty123", "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1",
    "admin123", "letmein1", "abc12345", "monkey123", "dragon123", "passw0rd", "p@ssw0rd", "trustno1",
    "superman", "batman123", "starwars", "whatever", "freedom1", "qazwsxedc", "1q2w3e4r", "zaq12wsx",
    "asdfghjk", "mftracker", "myfinancialtracker",
  ],
);

/** Why a new password isn't acceptable, or null if it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common. Pick something harder to guess.";
  return null;
}

export const hashPassword = (password: string) => Bun.password.hash(password, { algorithm: "argon2id" });

/** A real hash to verify against when the email doesn't exist, so both paths take about as long. */
const DUMMY_HASH = await hashPassword("not-a-real-password-just-for-timing");

export async function verifyPassword(password: string, hash: string | undefined) {
  try {
    // "!" marks an account without a usable password (the placeholder owner of pre-account data).
    if (!hash || hash === "!") {
      await Bun.password.verify(password, DUMMY_HASH);
      return false;
    }
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/** Emails are compared in lowercase, trimmed. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// ---------- Tokens and cookies ----------

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export const hashToken = (token: string) => new Bun.CryptoHasher("sha256").update(token).digest("hex");

export function readSessionToken(req: Request): string | null {
  const found: Record<string, string> = {};
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE || name === SECURE_SESSION_COOKIE) found[name] = rest.join("=");
  }
  // The prefixed cookie wins. ponytail: the bare-name fallback over HTTPS is only for the switch (sessions
  // issued before it); remove it 90 days (SESSION_MAX_AGE) after the first HTTPS deploy.
  return found[SECURE_SESSION_COOKIE] || found[SESSION_COOKIE] || null;
}

/** True when an HTTPS request authenticated with the old bare-name cookie: re-issue it as `__Host-`. */
export function usesLegacyCookie(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  return isSecure(req) && !cookie.includes(`${SECURE_SESSION_COOKIE}=`) && cookie.includes(`${SESSION_COOKIE}=`);
}

/** Secure everywhere except plain-http localhost development. */
function isSecure(req: Request) {
  const { protocol, hostname } = new URL(req.url);
  return protocol === "https:" || !(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
}

export function sessionCookie(req: Request, token: string, maxAgeMs: number) {
  return [
    `${isSecure(req) ? SECURE_SESSION_COOKIE : SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    isSecure(req) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export const clearSessionCookie = (req: Request) => sessionCookie(req, "", 0);
/** Also expires the bare name over HTTPS, in case a pre-switch (or planted) one is around. */
export const clearLegacyCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

// ---------- Users and sessions in the database ----------

export function createAuthStore(db: Db) {
  return {
    async findUserByEmail(email: string) {
      const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
      return user;
    },
    async findUserById(id: number) {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    },
    async createUser(email: string, passwordHash: string) {
      const [user] = await db.insert(users).values({ email: normalizeEmail(email), passwordHash }).returning();
      if (!user) throw new Error("insert returned no row");
      return user;
    },
    async setPassword(userId: number, passwordHash: string) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    },

    /** A fresh session; the token is returned once and never stored in clear. */
    async createSession(userId: number, now = Date.now()) {
      const token = newToken();
      const expiresAt = new Date(now + SESSION_TTL);
      await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, createdAt: new Date(now) });
      return { token, expiresAt };
    },

    /**
     * The session for a token, or null if unknown or expired (expired ones are deleted on sight).
     * Slides the expiry forward when more than a day of it has been used, but never past
     * SESSION_MAX_AGE from sign-in; `renewed` tells the caller to re-send the cookie with `maxAgeMs`.
     */
    async findSession(token: string, now = Date.now()) {
      const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      if (!row) return null;
      const hardEnd = row.createdAt.getTime() + SESSION_MAX_AGE;
      if (row.expiresAt.getTime() <= now || hardEnd <= now) {
        await db.delete(sessions).where(eq(sessions.id, row.id));
        return null;
      }
      let expiresAt = row.expiresAt.getTime();
      let renewed = false;
      const slid = Math.min(now + SESSION_TTL, hardEnd);
      if (expiresAt - now < SESSION_TTL - DAY && slid > expiresAt) {
        await db.update(sessions).set({ expiresAt: new Date(slid) }).where(eq(sessions.id, row.id));
        expiresAt = slid;
        renewed = true;
      }
      return { id: row.id, userId: row.userId, renewed, maxAgeMs: expiresAt - now };
    },

    async deleteSession(token: string) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    },

    /** Signs a user out everywhere, except (optionally) the session making the request. */
    async deleteOtherSessions(userId: number, keepToken?: string) {
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), keepToken ? ne(sessions.tokenHash, hashToken(keepToken)) : undefined));
    },

    /** Deletes sessions past their sliding expiry or their absolute cap (run at startup and hourly). */
    async purgeExpired(now = Date.now()) {
      await db.delete(sessions).where(or(lt(sessions.expiresAt, new Date(now)), lt(sessions.createdAt, new Date(now - SESSION_MAX_AGE))));
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

// ---------- Rate limiting ----------

/**
 * Fixed-window counters per key, bounded (audit SEC-2): at most `maxKeys` entries; when full, the oldest
 * entry is evicted in O(1) (Maps keep insertion order); expired entries are dropped when touched.
 * ponytail: in-memory, per process; use the DB or Redis for more than one instance (SEC-5).
 */
export function createRateLimiter(maxKeys = 50_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const live = (key: string, now: number) => {
    const entry = hits.get(key);
    if (entry && entry.resetAt <= now) hits.delete(key);
    return entry && entry.resetAt > now ? entry : undefined;
  };
  return {
    /** Current count for `key` in its window (0 if none). Doesn't record anything. */
    count(key: string, now = Date.now()) {
      return live(key, now)?.count ?? 0;
    },
    /** Records one hit and returns the new count. */
    hit(key: string, windowMs: number, now = Date.now()) {
      const entry = live(key, now);
      if (entry) return ++entry.count;
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value!);
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    },
    /** Records a hit; false when `key` is over `limit` within `windowMs`. */
    allow(key: string, limit: number, windowMs: number, now = Date.now()) {
      return this.hit(key, windowMs, now) <= limit;
    },
    reset(key: string) {
      hits.delete(key);
    },
    size: () => hits.size,
  };
}

const MINUTE = 60_000;

/**
 * Login throttling that can't be turned against the account owner (audit SEC-1, SEC-2):
 * - every attempt counts against the IP (30 / 15 min), checked first so an over-limit IP adds no other keys;
 * - only FAILED password checks count against the IP + email pair; 8 failures lock that pair for 15 min.
 *   A stranger's failures never block the owner, who signs in from another address;
 * - failures per email from all IPs only add a growing delay (up to 5 s): it slows distributed guessing
 *   without ever refusing the right password;
 * - a successful login clears that pair's counters.
 */
export function createLoginGuard(limiter = createRateLimiter()) {
  const WINDOW = 15 * MINUTE;
  const pair = (ip: string, email: string) => `login:fail:${email}:${ip}`;
  const perEmail = (email: string) => `login:fail:${email}`;
  return {
    limiter,
    /** Before the password check: blocked (429) or how long to wait first. */
    before(ip: string, email: string, now = Date.now()): { blocked: true } | { blocked: false; delayMs: number } {
      if (!limiter.allow(`login:ip:${ip}`, 30, WINDOW, now)) return { blocked: true };
      if (limiter.count(pair(ip, email), now) >= 8) return { blocked: true };
      const failures = limiter.count(perEmail(email), now);
      return { blocked: false, delayMs: Math.min(5_000, Math.max(0, failures - 10) * 250) };
    },
    failed(ip: string, email: string, now = Date.now()) {
      limiter.hit(pair(ip, email), WINDOW, now);
      limiter.hit(perEmail(email), WINDOW, now);
    },
    succeeded(ip: string, email: string) {
      limiter.reset(pair(ip, email));
    },
  };
}
