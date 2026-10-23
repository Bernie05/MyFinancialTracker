/**
 * Builds every API route, wrapped in the security gate. Used by the server (index.ts) and the tests.
 */
import { createAuthStore } from "./auth";
import type { Db } from "./db/client";
import { createDrizzleRepositories } from "./repositories/drizzle";
import { createApiRoutes } from "./routes/api";
import { createAuthRoutes, PUBLIC_AUTH_PATHS } from "./routes/auth";
import { protect, withSecurityHeaders } from "./security";

/** Largest request body accepted (audit SEC-7). The biggest real one is under 2 KB; Bun answers 413 above this. */
export const MAX_REQUEST_BODY = 64 * 1024;

export function createAppRoutes(db: Db) {
  const repos = createDrizzleRepositories(db);
  const auth = createAuthStore(db);
  const api = protect({ ...createApiRoutes(repos), ...createAuthRoutes(auth, repos) }, auth, ["/api/health", ...PUBLIC_AUTH_PATHS]);
  return {
    ...api,
    "/api/*": () => withSecurityHeaders(Response.json({ error: { message: "No such endpoint." } }, { status: 404 })),
  };
}
