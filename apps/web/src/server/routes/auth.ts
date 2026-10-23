/**
 * Register, sign in, sign out, who am I, change password.
 *
 * - Errors don't reveal whether an email has an account: login says "Invalid email or password", and
 *   register always answers the same 202 (audit SEC-3; see REGISTER_MESSAGE).
 * - Login throttling can't lock the owner out (createLoginGuard, audit SEC-1/SEC-2).
 * - Signing in always issues a new session token and drops the one the browser had (no fixation).
 * - Changing the password signs out every other session.
 * - Every outcome is logged without secrets (log.ts, audit SEC-8).
 */
import type { Server } from "bun";
import { changePasswordSchema, credentialsSchema, type User } from "../../shared/contracts";
import {
  clearLegacyCookie,
  clearSessionCookie,
  createLoginGuard,
  createRateLimiter,
  hashPassword,
  passwordProblem,
  readSessionToken,
  sessionCookie,
  SESSION_TTL,
  verifyPassword,
  type AuthStore,
} from "../auth";
import { currentUserId, runAsUser } from "../context";
import { ensureDefaultCategories } from "../db/defaults";
import { HttpError, json, readBody, route } from "../http";
import { logAuth } from "../log";
import type { Repositories } from "../repositories/types";

const MINUTE = 60_000;
const ip = (req: Request, server: Server<undefined>) => server.requestIP(req)?.address ?? "unknown";
const tooMany = () => new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
const publicUser = (u: { id: number; email: string }): User => ({ id: u.id, email: u.email });

/**
 * What register always says, whether or not the email already had an account, so it can't be used to
 * test emails. Nobody is signed in by registering: doing that only for new accounts would add a cookie
 * an attacker could see. The page sends everyone to sign in.
 */
export const REGISTER_MESSAGE = "If this email can be used, your account is ready. Sign in to continue.";

/** Paths that work without a session (everything else under /api needs one). */
export const PUBLIC_AUTH_PATHS = ["/api/auth/register", "/api/auth/login", "/api/auth/logout"];

export function createAuthRoutes(auth: AuthStore, repos: Repositories, guard = createLoginGuard()) {
  const limiter = createRateLimiter(); // register and password change; login has its own guard

  /** A new session for `userId`, replacing the one this browser sent (if any). */
  async function signIn(req: Request, userId: number, body: unknown) {
    const previous = readSessionToken(req);
    if (previous) await auth.deleteSession(previous);
    const { token } = await auth.createSession(userId);
    const res = json(body, 200);
    res.headers.append("Set-Cookie", sessionCookie(req, token, SESSION_TTL));
    return res;
  }

  return {
    "/api/auth/register": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        const from = ip(req, server);
        if (!limiter.allow(`register:ip:${from}`, 10, 60 * MINUTE)) {
          logAuth("rate_limited", { ip: from, detail: "register:ip" });
          throw tooMany();
        }
        const { email, password } = await readBody(req, credentialsSchema);
        const problem = passwordProblem(password); // independent of whether the email exists
        if (problem) throw new HttpError(400, "Some fields need fixing.", { password: problem });
        if (!limiter.allow(`register:email:${email}`, 5, 60 * MINUTE)) {
          logAuth("rate_limited", { ip: from, email, detail: "register:email" });
          throw tooMany();
        }
        // Hash first in every case: the slow part costs the same whether or not the account exists.
        const passwordHash = await hashPassword(password);
        const existing = await auth.findUserByEmail(email);
        let userId = existing?.id;
        if (!existing) {
          const user = await auth.createUser(email, passwordHash);
          await runAsUser(user.id, () => ensureDefaultCategories(repos));
          userId = user.id;
        }
        logAuth("register", { ip: from, userId, email, detail: existing ? "existing" : "created" });
        return json({ message: REGISTER_MESSAGE }, 202);
      }),
    },

    "/api/auth/login": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        const from = ip(req, server);
        const { email, password } = await readBody(req, credentialsSchema);
        const gate = guard.before(from, email);
        if (gate.blocked) {
          logAuth("rate_limited", { ip: from, email, detail: "login" });
          throw tooMany();
        }
        if (gate.delayMs > 0) await Bun.sleep(gate.delayMs); // many failures for this email from elsewhere
        const user = await auth.findUserByEmail(email);
        // verifyPassword checks a dummy hash when there's no user, so timing doesn't reveal accounts.
        if (!(await verifyPassword(password, user?.passwordHash)) || !user) {
          guard.failed(from, email);
          logAuth("login_fail", { ip: from, email });
          throw new HttpError(401, "Invalid email or password.");
        }
        guard.succeeded(from, email);
        logAuth("login_ok", { ip: from, userId: user.id });
        return signIn(req, user.id, { user: publicUser(user) });
      }),
    },

    "/api/auth/logout": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        const token = readSessionToken(req);
        const session = token ? await auth.findSession(token) : null;
        if (token) await auth.deleteSession(token);
        logAuth("logout", { ip: ip(req, server), userId: session?.userId });
        const res = new Response(null, { status: 204 });
        res.headers.append("Set-Cookie", clearSessionCookie(req));
        res.headers.append("Set-Cookie", clearLegacyCookie());
        return res;
      }),
    },

    "/api/auth/me": {
      GET: route(async () => {
        const user = await auth.findUserById(currentUserId());
        if (!user) throw new HttpError(401, "Sign in to continue.");
        return json({ user: publicUser(user) });
      }),
    },

    "/api/auth/password": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        const userId = currentUserId();
        const from = ip(req, server);
        if (!limiter.allow(`password:user:${userId}:${from}`, 10, 15 * MINUTE)) {
          logAuth("rate_limited", { ip: from, userId, detail: "password" });
          throw tooMany();
        }
        const { currentPassword, newPassword } = await readBody(req, changePasswordSchema);
        const user = await auth.findUserById(userId);
        if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
          logAuth("password_change_fail", { ip: from, userId });
          throw new HttpError(400, "Some fields need fixing.", { currentPassword: "That isn't your current password." });
        }
        const problem = passwordProblem(newPassword);
        if (problem) throw new HttpError(400, "Some fields need fixing.", { newPassword: problem });
        await auth.setPassword(userId, await hashPassword(newPassword));
        await auth.deleteOtherSessions(userId, readSessionToken(req) ?? undefined);
        logAuth("password_change", { ip: from, userId });
        return new Response(null, { status: 204 });
      }),
    },
  };
}
