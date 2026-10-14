/**
 * Database schema (SQLite via Drizzle).
 *
 * Conventions
 * - Money is an INTEGER number of minor units (centavos) in columns ending `Minor`.
 *   Never REAL: floats can't represent most decimal amounts exactly.
 * - Rates are integer basis points (`…Bps`): 12.5% APR is 1250.
 * - Calendar dates are TEXT `YYYY-MM-DD` and months `YYYY-MM`. A transaction happens on
 *   a day, not an instant, so storing a timezone-free date avoids "it moved to yesterday" bugs.
 * - Audit timestamps (`createdAt`) are instants, stored as unix seconds.
 * - Amounts are stored positive; direction lives in `type`. A CHECK enforces both.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactionTypes = ["expense", "income"] as const;
export type TransactionType = (typeof transactionTypes)[number];

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type", { enum: transactionTypes }).notNull(),
    /** Chart color slot 1–6 (`chart-1` … `chart-6` in @mft/ui). */
    color: integer("color").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("categories_name_type_unique").on(t.name, t.type),
    check("categories_color_range", sql`${t.color} between 1 and 6`),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: transactionTypes }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    description: text("description").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    occurredOn: text("occurred_on").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_occurred_on_idx").on(t.occurredOn),
    index("transactions_category_idx").on(t.categoryId),
    check("transactions_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    limitMinor: integer("limit_minor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("budgets_category_month_unique").on(t.categoryId, t.month),
    check("budgets_limit_positive", sql`${t.limitMinor} > 0`),
  ],
);

export const savingsGoals = sqliteTable(
  "savings_goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    targetMinor: integer("target_minor").notNull(),
    savedMinor: integer("saved_minor").notNull().default(0),
    targetDate: text("target_date"),
    createdAt: createdAt(),
  },
  (t) => [
    check("savings_goals_target_positive", sql`${t.targetMinor} > 0`),
    check("savings_goals_saved_non_negative", sql`${t.savedMinor} >= 0`),
  ],
);

export const debts = sqliteTable(
  "debts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    lender: text("lender"),
    principalMinor: integer("principal_minor").notNull(),
    balanceMinor: integer("balance_minor").notNull(),
    interestRateBps: integer("interest_rate_bps").notNull().default(0),
    /** Day of the month a payment is due, 1–31. */
    dueDay: integer("due_day"),
    createdAt: createdAt(),
  },
  (t) => [
    check("debts_principal_positive", sql`${t.principalMinor} > 0`),
    check("debts_balance_non_negative", sql`${t.balanceMinor} >= 0`),
    check("debts_rate_non_negative", sql`${t.interestRateBps} >= 0`),
    check("debts_due_day_range", sql`${t.dueDay} is null or ${t.dueDay} between 1 and 31`),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
