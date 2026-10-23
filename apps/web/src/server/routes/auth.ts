/**
 * Register, sign in, sign out, who am I, change password.
 *
 * - Errors don't reveal whether an email has an account ("Invalid email or password").
 * - Login and register are rate limited per IP and per email (in memory; see auth.ts).
 * - Signing in always issues a new session token and drops the one the browser had (no fixation).
 * - Changing the password signs out every other session.
 */
import type { Server } from "bun";
import { changePasswordSchema, credentialsSchema, type User } from "../../shared/contracts";
import {
  clearSessionCookie,
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
import type { Repositories } from "../repositories/types";

const MINUTE = 60_000;
const limiter = createRateLimiter();
const ip = (req: Request, server: Server<undefined>) => server.requestIP(req)?.address ?? "unknown";
const tooMany = () => new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
const publicUser = (u: { id: number; email: string }): User => ({ id: u.id, email: u.email });

/** Paths that work without a session (everything else under /api needs one). */
export const PUBLIC_AUTH_PATHS = ["/api/auth/register", "/api/auth/login", "/api/auth/logout"];

export function createAuthRoutes(auth: AuthStore, repos: Repositories) {
  /** A new session for `userId`, replacing the one this browser sent (if any), as a 200/201 response. */
  async function signIn(req: Request, userId: number, body: unknown, status: number) {
    const previous = readSessionToken(req);
    if (previous) await auth.deleteSession(previous);
    const { token } = await auth.createSession(userId);
    const res = json(body, status);
    res.headers.append("Set-Cookie", sessionCookie(req, token, SESSION_TTL));
    return res;
  }

  return {
    "/api/auth/register": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        if (!limiter.allow(`register:ip:${ip(req, server)}`, 10, 60 * MINUTE)) throw tooMany();
        const { email, password } = await readBody(req, credentialsSchema);
        const problem = passwordProblem(password);
        if (problem) throw new HttpError(400, "Some fields need fixing.", { password: problem });
        if (!limiter.allow(`register:email:${email}`, 5, 60 * MINUTE)) throw tooMany();
        if (await auth.findUserByEmail(email)) {
          // Saying "taken" outright would confirm the account exists; point to sign-in instead.
          throw new HttpError(409, "Couldn't create an account with that email. If you already have one, sign in instead.");
        }
        const user = await auth.createUser(email, await hashPassword(password));
        await runAsUser(user.id, () => ensureDefaultCategories(repos));
        return signIn(req, user.id, { user: publicUser(user) }, 201);
      }),
    },

    "/api/auth/login": {
      POST: route(async (req: Request, server: Server<undefined>) => {
        const { email, password } = await readBody(req, credentialsSchema);
        const okIp = limiter.allow(`login:ip:${ip(req, server)}`, 30, 15 * MINUTE);
        const okEmail = limiter.allow(`login:email:${email}`, 8, 15 * MINUTE);
        if (!okIp || !okEmail) throw tooMany();
        const user = await auth.findUserByEmail(email);
        // verifyPassword checks a dummy hash when there's no user, so timing doesn't reveal accounts.
        if (!(await verifyPassword(password, user?.passwordHash)) || !user) {
          throw new HttpError(401, "Invalid email or password.");
        }
        limiter.reset(`login:email:${email}`);
        return signIn(req, user.id, { user: publicUser(user) }, 200);
      }),
    },

    "/api/auth/logout": {
      POST: route(async (req: Request) => {
        const token = readSessionToken(req);
        if (token) await auth.deleteSession(token);
        const res = new Response(null, { status: 204 });
        res.headers.append("Set-Cookie", clearSessionCookie(req));
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
        if (!limiter.allow(`password:user:${userId}:${ip(req, server)}`, 10, 15 * MINUTE)) throw tooMany();
        const { currentPassword, newPassword } = await readBody(req, changePasswordSchema);
        const user = await auth.findUserById(userId);
        if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
          throw new HttpError(400, "Some fields need fixing.", { currentPassword: "That isn't your current password." });
        }
        const problem = passwordProblem(newPassword);
        if (problem) throw new HttpError(400, "Some fields need fixing.", { newPassword: problem });
        await auth.setPassword(userId, await hashPassword(newPassword));
        await auth.deleteOtherSessions(userId, readSessionToken(req) ?? undefined);
        return new Response(null, { status: 204 });
      }),
    },
  };
}
