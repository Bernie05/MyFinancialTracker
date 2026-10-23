# @mft/web

The MyFinancialTracker app: a Bun server that serves a React client and a JSON API over SQLite (Drizzle ORM).

## First run

```sh
bun install
bun run db:generate        # drizzle-kit writes ./drizzle/0000_*.sql from schema.ts. Commit it.
bun run db:migrate         # applies migrations to data/mft.sqlite
bun run db:seed            # tops up default categories for every account (new accounts get them on sign-up)
bun run db:seed:demo       # optional: demo account demo@mft.local with 6 months of demo data; prints its password
                           #   once (re-running replaces the demo rows; --reset-password prints a new one)
bun run dev                # http://localhost:3000 with hot reload
```

From the repo root, `bun run dev` builds `@mft/ui` first, then starts this app.

Environment: `DATABASE_PATH` (default `data/mft.sqlite`) and `PORT` (default `3000`).

## Accounts and security

Everyone signs in; each account sees only its own data.

- **Passwords**: argon2id via `Bun.password`. At least 8 characters; a short list of common passwords is refused. Emails are lowercased.
- **Sessions**: a random 256-bit token in the `mft_session` cookie (HttpOnly, SameSite=Lax, Secure except on plain-http localhost). Only its SHA-256 hash is stored (`sessions` table). 30-day expiry that slides forward while used; signing in always issues a new token; signing out deletes it; changing the password signs out every other session.
- **No account enumeration**: a wrong password and an unknown email get the same "Invalid email or password", and take about as long (a dummy hash is checked).
- **Rate limits** (in memory, per process): sign-in 30 / 15 min per IP and 8 / 15 min per email; sign-up 10 / hour per IP and 5 / hour per email. **Move to Redis or the database before running more than one server instance.**
- **Per-user data**: every data table has `user_id` (NOT NULL, cascades with the user). The security gate (`src/server/security.ts`) checks the session on every `/api` route except health, sign-up, sign-in and sign-out, then runs the handler as that user (`src/server/context.ts`). Every repository query filters on that user id, and a query that runs without a user throws instead of reading everyone's rows. Someone else's id is "not found": **404, never 403**. Names and colors are unique per user.
- **CSRF**: SameSite=Lax, plus every state-changing request must carry a JSON body (forms can't) and, when it has an Origin header, come from this origin (403 otherwise).
- **Headers**: API responses carry `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and `Cache-Control: no-store`. The HTML page sets its CSP and referrer policy in `<meta>` tags (Bun can't add headers to the HTML bundle), so **frame-ancestors / X-Frame-Options for the page must be added by the production proxy**.
- **Existing data**: migration 0006 gives rows from before accounts to a placeholder `demo@mft.local` with an unusable password; `bun run db:seed:demo` sets one and prints it.
- **Tests**: `bun test` covers password hashing, sessions (expiry, sliding, revocation) and an isolation test: a second user gets 404 on every read, update and delete of the first user's transactions, categories, cards, payments and installments.

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
| POST | `/api/auth/register` | `{ email, password }` | `201 { user }` and the session cookie; `400` weak password; `409` email can't be used; `429` too many attempts |
| POST | `/api/auth/login` | `{ email, password }` | `200 { user }` and a new session cookie; `401` "Invalid email or password"; `429` |
| POST | `/api/auth/logout` | `{}` | `204`; deletes the session and clears the cookie |
| GET | `/api/auth/me` | | `{ user: { id, email } }`, or `401` |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` | `204`; other sessions are signed out |
| PATCH | `/api/transactions/:id` | any of `amountMinor`, `description`, `categoryId`, `occurredOn`, `note`, `cardId` | `Transaction`; `409` for a billed installment month (edit its plan) |
| GET | `/api/categories` | | `CategoryListItem[]`, flat: each with `parentId` (null = top level), its own `transactionCount`, and `color` (a subcategory reports its parent's) |
| POST | `/api/categories` | top level `{ name, type, color }`, or subcategory `{ name, type, parentId }` (one level; same type as the parent) | `201 CategoryListItem`; `409` if the name exists under that parent or the color is in use |
| PATCH | `/api/categories/:id` | any of `name`, `type`, `color`, `parentId` (null = top level; then it needs a color) | `CategoryListItem`; `409` on a name or color clash, a type change while it has transactions or subcategories, or nesting a category that has subcategories |
| DELETE | `/api/categories/:id` | `?moveTo=<id>` (needed when it has transactions or plans); for a parent with subcategories `childrenTo=<parent id>` or `deleteChildren=1` (only if they're unused) | `204`, all in one DB transaction; `409` when a needed choice is missing |
| GET | `/api/transactions` | all optional: `type`, `from`/`to` (inclusive `YYYY-MM-DD`), `categoryId` (a parent includes its subcategories), `cardId`, `installment` (`none`: regular charges only, `only`: billed installment months), `q` (description or note, ≤100 chars), `page` (default 1), `pageSize` (default 20, max 100) | `{ items, total, page, pageSize, incomeMinor, expenseMinor }`: one page, newest first; count and sums cover every match |
| POST | `/api/transactions` | `NewTransaction` (optional `cardId`: expenses only, active card) | `201 Transaction` (includes `card` or null) |
| DELETE | `/api/transactions/:id` | | `204`, `404`, or `409` for a billed installment month (manage it from its plan) |
| GET | `/api/summary` | `?month=YYYY-MM` (optional `&cardId=`) | `MonthSummary` (income, expense, net, expense by parent category with `children`: each subcategory, plus the parent itself when booked directly) |
| GET | `/api/summary/monthly` | `?to=YYYY-MM&months=6` (1-24, optional `&cardId=`) | `MonthTotals[]`, oldest first, empty months as zeros |

| GET | `/api/cards` | | `CardSummary[]`: each card with `transactionCount` and today's `summary` (balance, available, utilisation, cycle, statement, remaining due, due date, days, status) |
| POST | `/api/cards` | `{ name, issuer?, last4?, limitMinor, closingDay, dueDay, notifyDays? (0-30, default 3), color }` | `201 CardSummary`; `409` on a name or color clash |
| GET / PATCH | `/api/cards/:id` | PATCH: any card field, plus `archived` | `CardSummary` |
| DELETE | `/api/cards/:id` | | `204`; `409` if it has transactions (archive it instead). Payments go with it |
| GET / POST | `/api/cards/:id/payments` | POST `{ amountMinor, paidOn, note? }` | `CardPayment[]` / `201 CardPayment`. Payments are not expenses |
| DELETE | `/api/cards/:id/payments/:paymentId` | | `204` or `404` |
| GET / POST | `/api/cards/:id/installments` | POST `{ description, categoryId, purchasedOn, principalMinor, months (1-60), addOnRateBps? (0-500, default 0), amortizationMinor?, feeMinor?, firstBillingMonth? }` | `InstallmentDetail[]` (terms, derived monthly, total, interest, months billed, remaining, end, and `schedule`) / `201 InstallmentDetail` |
| GET / PATCH / DELETE | `/api/installments/:id` | PATCH: any term, or `preterminatedOn` (a date, or null to undo) | `InstallmentDetail` (with `schedule`: each month's statement date, amount, billed/upcoming, remaining after) / `204` |
| GET | `/api/alerts` | | `CardAlert[]`: active cards due within their `notifyDays` or overdue, still owing, most urgent first |

Statement math (`src/shared/cardCycle.ts`, tested with `bun test`): a statement closes at the end of `closingDay`; its balance is all charges up to the close minus all payments up to it, so unpaid amounts carry forward; it is due on the first `dueDay` after the close. Days past a short month's end mean its last day (31 → Sep 30). Status is `paid` once payments after the close cover it, else `overdue`, `due_soon` (within `notifyDays`) or `upcoming`.

### Installments (`src/shared/installments.ts`, tested with `bun test`)

- **Terms are stored, the schedule is derived.** Month *i* is billed on the statement that closes in billing month *i* (default: the first statement on or after the purchase), dated on that closing date.
- **Amounts.** Add-on interest = principal × monthly rate × months. Each month is total ÷ months rounded to the centavo, and the last month absorbs the rounding. A bank amortization figure, if given, wins: every month is that amount. A processing fee is billed once, with month 1.
- **Billed months are real expenses.** Each billed month is written as an auto-generated expense on the card, in the plan's category, linked to the plan (`installment_id`, `installment_seq`, unique together) and read-only. That makes it count in the month it is billed, everywhere: statement balance, amount due and reminders, the Dashboard, reports, category totals, Expenses lists and filters. The full price is never counted up front, and nothing is counted twice. Generation is idempotent and runs on reads once a day and after every plan change. Editing a plan, or the card's statement day, rebuilds its billed months; deleting a plan removes them.
- **Available credit** is reduced by the plan's unbilled principal (utilisation counts it too), as banks hold it against the limit.
- **Pre-termination.** Months closing before the pre-termination date's cycle are billed as usual; the remaining principal is billed in one amount on that cycle's statement (no further add-on interest), and the plan then completes. Record any bank pre-termination fee as a normal expense.
- **Card summary** adds `installmentMonthlyTotalMinor`, `installmentRemainingMinor` (still to be billed) and `activeInstallments`.

All routes except `/api/health` and the three public auth routes need a session (`401` without one). Errors always look like `{ "error": { "message": "…", "fields": { "amountMinor": "…" } } }`.

Categories have one level of subcategories. A subcategory has its parent's type and inherits its color (stored as null); names are unique within a parent. Filtering transactions by a parent includes its subcategories, and summaries roll up to parents. Category `color` is a preset key (`red`, `orange`, `amber`, `yellow`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`, `brown`, `grey`; each a theme-aware `--cat-*` token in @mft/ui) or a custom `#rrggbb`. A DB CHECK enforces the format, and colors are unique across top-level categories: a unique index on `color`, plus an API check that treats a hex equal to a preset's light value as that preset. POST and PATCH answer `409` naming the category that already uses it.

## Schema

`categories`, `transactions`, `budgets`, `savings_goals` and `debts` are defined; the API covers categories and transactions so far. Budgets, goals and debts are the next slices.
