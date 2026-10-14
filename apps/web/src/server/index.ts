/**
 * Composition root: the one place that knows about concrete implementations.
 * It opens the database, builds the repositories, hands them to the routes and starts Bun.serve.
 *
 * Bun serves the React client too: importing index.html gives Bun a bundle to build and
 * serve (with hot reload in development), so there's no separate Vite/webpack process.
 */
import index from "../client/index.html";
import { createDb } from "./db/client";
import { createDrizzleRepositories } from "./repositories/drizzle";
import { createApiRoutes } from "./routes/api";

const isProduction = process.env.NODE_ENV === "production";
const repos = createDrizzleRepositories(createDb());

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    ...createApiRoutes(repos),
    "/api/*": Response.json({ error: { message: "No such endpoint." } }, { status: 404 }),
    "/*": index,
  },
  development: !isProduction && { hmr: true, console: true },
});

console.log(`MyFinancialTracker running at ${server.url}`);
