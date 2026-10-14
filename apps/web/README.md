# @mft/web

The MyFinancialTracker app: a Bun server that serves a React client and a JSON API over SQLite (Drizzle ORM).

## First run

```sh
bun install
bun run db:generate        # drizzle-kit writes ./drizzle/0000_*.sql from schema.ts. Commit it.
bun run db:migrate         # applies migrations to data/mft.sqlite
bun run db:seed --sample   # default categories, plus this month's sample transactions
bun run dev                # http://localhost:3000 with hot reload
```

From the repo root, `bun run dev` builds `@mft/ui` first, then starts this app.

Environment: `DATABASE_PATH` (default `data/mft.sqlite`) and `PORT` (default `3000`).

## Architecture

```
src/
  shared/contracts.ts        Zod schemas: the API contract, used by server AND client
  server/
    index.ts                 composition root: db → repositories → routes → Bun.serve
    db/schema.ts             Drizzle tables (money = integer centavos, dates = YYYY-MM-DD)
    db/client.ts             opens SQLite with foreign keys + WAL
    db/migrate.ts, seed.ts
    repositories/types.ts    interfaces the routes depend on
    repositories/drizzle.ts  the SQLite implementation
    routes/api.ts            validate → repository → JSON
    http.ts                  JSON helpers + one error boundary for every route
  client/
    api/                     typed fetch layer; validates every response
    lib/                     dates, amount parsing, useAsync
    features/transactions/   the first feature slice
```

Requests flow one way: **route → repository interface → Drizzle → SQLite**. Routes never import Drizzle, so moving to Neon Postgres later means writing `repositories/postgres.ts` (and swapping `drizzle-orm/bun-sqlite` for a Postgres driver and `sqlite-core` for `pg-core`) while routes, contracts and the client stay the same.

## API

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/api/categories` | | `Category[]` |
| GET | `/api/transactions` | `?month=YYYY-MM` | `Transaction[]`, newest first |
| POST | `/api/transactions` | `NewTransaction` | `201 Transaction` |
| DELETE | `/api/transactions/:id` | | `204` or `404` |
| GET | `/api/summary` | `?month=YYYY-MM` | `MonthSummary` (income, expense, net, expense by category) |

Errors always look like `{ "error": { "message": "…", "fields": { "amountMinor": "…" } } }`.

## Schema

`categories`, `transactions`, `budgets`, `savings_goals` and `debts` are defined; the API covers categories and transactions so far. Budgets, goals and debts are the next slices.
