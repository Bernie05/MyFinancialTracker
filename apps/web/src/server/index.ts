/**
 * Composition root: the one place that knows about concrete implementations.
 * It opens the database, builds the routes (app.ts: repositories, auth, the security gate) and starts Bun.serve.
 *
 * Bun serves the React client too: importing index.html gives Bun a bundle to build and
 * serve (with hot reload in development), so there's no separate Vite/webpack process.
 * The HTML document's CSP and referrer policy are <meta> tags in index.html (Bun can't add headers to it).
 */
import index from "../client/index.html";
import { createAppRoutes, MAX_REQUEST_BODY } from "./app";
import { createAuthStore } from "./auth";
import { DEV_USER_EMAIL, REQUIRE_LOGIN } from "./config";
import { createDb } from "./db/client";

const isProduction = process.env.NODE_ENV === "production";

const db = createDb();

// Expired and over-age sessions are deleted at startup and then hourly (audit SEC-6).
const auth = createAuthStore(db);
await auth.purgeExpired();
setInterval(() => auth.purgeExpired().catch((err) => console.error("session purge failed:", err instanceof Error ? err.message : err)), 60 * 60 * 1000).unref();

// Login switched off for development (config.ts): act as DEV_USER_EMAIL, local machine only.
let devUserId: number | undefined;
if (!REQUIRE_LOGIN) {
  if (isProduction) throw new Error("REQUIRE_LOGIN = false is for development only; set it to true before running in production.");
  const devUser = await auth.findUserByEmail(DEV_USER_EMAIL);
  if (!devUser) throw new Error(`REQUIRE_LOGIN = false but ${DEV_USER_EMAIL} doesn't exist: run \`bun run db:seed:demo\` first.`);
  devUserId = devUser.id;
  console.warn(`⚠ Login is OFF (config.ts REQUIRE_LOGIN = false): acting as ${DEV_USER_EMAIL}, listening on 127.0.0.1 only.`);
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: devUserId === undefined ? undefined : "127.0.0.1",
  maxRequestBodySize: MAX_REQUEST_BODY,
  routes: {
    // Every /api route is behind the session check and security headers (see security.ts).
    ...createAppRoutes(db, devUserId),
    "/*": index,
  },
  development: !isProduction && { hmr: true, console: true },
});

console.log(`MyFinancialTracker running at ${server.url}`);
