/**
 * Builds every API route, wrapped in the security gate. Used by the server (index.ts) and the tests.
 */
import { createAuthStore } from "./auth";
import type { Db } from "./db/client";
import { createDrizzleRepositories } from "./repositories/drizzle";
import { createApiRoutes } from "./routes/api";
import { createAuthRoutes, PUBLIC_AUTH_PATHS } from "./routes/auth";
import { protect, withSecurityHeaders } from "./security";

// SEC-7 body limits: 64 KB per route (enforced in readBody), 4 MB server-wide for the Excel import.
export { MAX_IMPORT_BODY, MAX_REQUEST_BODY } from "./http";

/** `devUserId`: only when login is switched off for development (config.ts REQUIRE_LOGIN). */
export function createAppRoutes(db: Db, devUserId?: number) {
  const repos = createDrizzleRepositories(db);
  const auth = createAuthStore(db);
  const api = protect({ ...createApiRoutes(repos), ...createAuthRoutes(auth, repos) }, auth, ["/api/health", ...PUBLIC_AUTH_PATHS], devUserId);
  return {
    ...api,
    "/api/*": () => withSecurityHeaders(Response.json({ error: { message: "No such endpoint." } }, { status: 404 })),
  };
}
