/**
 * Composition root: the one place that knows about concrete implementations.
 * It opens the database, builds the routes (app.ts: repositories, auth, the security gate) and starts Bun.serve.
 *
 * Bun serves the React client too: importing index.html gives Bun a bundle to build and
 * serve (with hot reload in development), so there's no separate Vite/webpack process.
 * The HTML document's CSP and referrer policy are <meta> tags in index.html (Bun can't add headers to it).
 */
import index from "../client/index.html";
import { createAppRoutes } from "./app";
import { createDb } from "./db/client";

const isProduction = process.env.NODE_ENV === "production";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    // Every /api route is behind the session check and security headers (see security.ts).
    ...createAppRoutes(createDb()),
    "/*": index,
  },
  development: !isProduction && { hmr: true, console: true },
});

console.log(`MyFinancialTracker running at ${server.url}`);
