/**
 * The gate every API request passes through (wired once in app.ts):
 *
 * - Authentication: every route needs a valid session unless its path is listed as public. New routes
 *   are protected by default. The handler then runs as that user (context.ts), so repositories scope
 *   every query to them.
 * - CSRF: the session cookie is SameSite=Lax, and on top of that every state-changing request must come
 *   from this origin (a mismatched Origin header is refused) and carry a JSON body (forms can't send one).
 * - Security headers on every API response.
 */
import type { Server } from "bun";
import { clearSessionCookie, readSessionToken, SESSION_TTL, sessionCookie, type AuthStore } from "./auth";
import { runAsUser } from "./context";

// Route handlers take Request & { params } (Bun adds params); `any` covers that subtype only, results stay typed.
type Handler = (req: any, server: Server<undefined>) => Response | Promise<Response>;
type MethodHandlers = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

const API_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  // Responses carry personal financial data: never cache them.
  "Cache-Control": "no-store",
};

export function withSecurityHeaders(res: Response) {
  // Some responses (e.g. Response.json) have immutable headers in tests; copy when needed.
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}

const fail = (status: number, message: string) => Response.json({ error: { message } }, { status });

/** Refuses cross-site writes. Requests without an Origin (curl, server-to-server) carry no browser cookies by accident. */
function csrfProblem(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return fail(403, "This request came from another site and was refused.");
  if (["POST", "PUT", "PATCH"].includes(req.method) && !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "Send the request body as JSON.");
  }
  return null;
}

/**
 * Wraps every handler of every API route. `publicPaths` skip the session check (login, register,
 * logout, health); they still get the CSRF check and headers.
 */
export function protect(routes: Record<string, MethodHandlers>, auth: AuthStore, publicPaths: string[]) {
  const wrapped: Record<string, MethodHandlers> = {};
  for (const [path, methods] of Object.entries(routes)) {
    const isPublic = publicPaths.includes(path);
    wrapped[path] = {};
    for (const [method, handler] of Object.entries(methods) as [keyof MethodHandlers, Handler][]) {
      wrapped[path][method] = async (req, server) => {
        const csrf = csrfProblem(req);
        if (csrf) return withSecurityHeaders(csrf);
        if (isPublic) return withSecurityHeaders(await handler(req, server));

        const token = readSessionToken(req);
        const session = token ? await auth.findSession(token) : null;
        if (!session || !token) {
          const res = fail(401, "Sign in to continue.");
          if (token) res.headers.append("Set-Cookie", clearSessionCookie(req)); // stale cookie: drop it
          return withSecurityHeaders(res);
        }
        const res = withSecurityHeaders(await runAsUser(session.userId, () => handler(req, server)));
        // Sliding expiry: re-send the cookie when the server extended the session.
        if (session.renewed) res.headers.append("Set-Cookie", sessionCookie(req, token, SESSION_TTL));
        return res;
      };
    }
  }
  return wrapped;
}
