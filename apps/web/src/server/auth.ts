/**
 * Accounts and sessions.
 *
 * - Passwords: Bun.password (argon2id). Minimum 8 characters, a short list of common passwords refused.
 * - Sessions: a random 256-bit token in an HttpOnly cookie; only its SHA-256 hash is stored, so a copy of
 *   the database can't be replayed as logins. 30-day expiry that slides forward (at most once a day)
 *   while the session is used. Login always issues a new token (and drops the one it replaces).
 * - Rate limits: in memory, per IP and per email. Fine for one server process; move to Redis (or the DB)
 *   before running more than one instance.
 */
import { and, eq, lt, ne } from "drizzle-orm";
import type { Db } from "./db/client";
import { sessions, users } from "./db/schema";

export const SESSION_COOKIE = "mft_session";
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 30 * DAY;

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
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** Secure everywhere except plain-http localhost development. */
function isSecure(req: Request) {
  const { protocol, hostname } = new URL(req.url);
  return protocol === "https:" || !(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
}

export function sessionCookie(req: Request, token: string, maxAgeMs: number) {
  return [
    `${SESSION_COOKIE}=${token}`,
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
      await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
      return { token, expiresAt };
    },

    /**
     * The session for a token, or null if unknown or expired (expired ones are deleted on sight).
     * Slides the expiry forward when more than a day of it has been used; `renewed` tells the caller to
     * re-send the cookie with the new Max-Age.
     */
    async findSession(token: string, now = Date.now()) {
      const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      if (!row) return null;
      if (row.expiresAt.getTime() <= now) {
        await db.delete(sessions).where(eq(sessions.id, row.id));
        return null;
      }
      let renewed = false;
      if (row.expiresAt.getTime() - now < SESSION_TTL - DAY) {
        await db.update(sessions).set({ expiresAt: new Date(now + SESSION_TTL) }).where(eq(sessions.id, row.id));
        renewed = true;
      }
      return { id: row.id, userId: row.userId, renewed };
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

    async purgeExpired(now = Date.now()) {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

// ---------- Rate limiting ----------

/** Fixed-window counter per key. ponytail: in-memory, per process; use Redis or the DB for >1 instance. */
export function createRateLimiter() {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Records a hit; false when `key` is over `limit` within `windowMs`. */
    allow(key: string, limit: number, windowMs: number, now = Date.now()) {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
