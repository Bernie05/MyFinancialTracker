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
import { check, index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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
    /**
     * Parents only: a preset key (`red`, `blue`, … → the `--cat-<key>` tokens in @mft/ui, tuned per theme)
     * or a custom lowercase hex `#rrggbb`. A subcategory stores null and inherits its parent's color.
     */
    color: text("color"),
    /** The parent for a subcategory (one level only, same type: enforced by the API). */
    parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Names are unique within a parent (top level counts as parent 0).
    uniqueIndex("categories_name_type_parent_unique").on(t.name, t.type, sql`coalesce(${t.parentId}, 0)`),
    // One color per parent across both types: the dashboard shows them side by side. Subcategories are null.
    // (A custom hex equal to a preset's value is caught in the API, which knows the preset values.)
    uniqueIndex("categories_color_unique").on(t.color),
    index("categories_parent_idx").on(t.parentId),
    check(
      "categories_color_valid",
      sql`${t.color} is null or ${t.color} in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or ${t.color} glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'`,
    ),
    // A parent has a color; a subcategory doesn't (it inherits).
    check("categories_color_parent_only", sql`(${t.parentId} is null) = (${t.color} is not null)`),
  ],
);

/**
 * A credit card the user tracks. Only the last 4 digits are ever stored, never a full number.
 * Days of month are 1-31; past a short month's end they mean its last day (see shared/cardCycle.ts).
 */
export const creditCards = sqliteTable(
  "credit_cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    issuer: text("issuer"),
    last4: text("last4"),
    limitMinor: integer("limit_minor").notNull(),
    closingDay: integer("closing_day").notNull(),
    dueDay: integer("due_day").notNull(),
    notifyDays: integer("notify_days").notNull().default(3),
    /** Same values as categories.color: a preset key or `#rrggbb`. Unique among cards. */
    color: text("color").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("credit_cards_name_unique").on(t.name),
    uniqueIndex("credit_cards_color_unique").on(t.color),
    check("credit_cards_last4", sql`${t.last4} is null or ${t.last4} glob '[0-9][0-9][0-9][0-9]'`),
    check("credit_cards_limit_positive", sql`${t.limitMinor} > 0`),
    check("credit_cards_closing_day", sql`${t.closingDay} between 1 and 31`),
    check("credit_cards_due_day", sql`${t.dueDay} between 1 and 31`),
    check("credit_cards_notify_days", sql`${t.notifyDays} between 0 and 30`),
    check("credit_cards_color_valid", sql`${t.color} in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or ${t.color} glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'`),
  ],
);

/** Money paid to a card. Not an expense: the charges already were, so counting payments too would double-count. */
export const cardPayments = sqliteTable(
  "card_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    paidOn: text("paid_on").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("card_payments_card_paid_on_idx").on(t.cardId, t.paidOn),
    check("card_payments_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

/**
 * An installment plan on a card. Only the terms are stored; the month-by-month schedule is derived
 * (shared/installments.ts). Each billed month is materialised as a linked, read-only expense
 * transaction (installment_id + installment_seq), so statements, reports and lists need no special case.
 */
export const installments = sqliteTable(
  "installments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    purchasedOn: text("purchased_on").notNull(),
    principalMinor: integer("principal_minor").notNull(),
    months: integer("months").notNull(),
    /** Monthly add-on rate in basis points (0.79% a month = 79). */
    addOnRateBps: integer("add_on_rate_bps").notNull().default(0),
    /** The bank's monthly figure; when set it wins over the computed one. */
    amortizationMinor: integer("amortization_minor"),
    feeMinor: integer("fee_minor").notNull().default(0),
    /** `YYYY-MM` whose statement bills month 1. */
    firstBillingMonth: text("first_billing_month").notNull(),
    preterminatedOn: text("preterminated_on"),
    createdAt: createdAt(),
  },
  (t) => [
    index("installments_card_idx").on(t.cardId),
    check("installments_principal_positive", sql`${t.principalMinor} > 0`),
    check("installments_months_range", sql`${t.months} between 1 and 60`),
    check("installments_rate_range", sql`${t.addOnRateBps} between 0 and 500`),
    check("installments_amortization_positive", sql`${t.amortizationMinor} is null or ${t.amortizationMinor} > 0`),
    check("installments_fee_nonnegative", sql`${t.feeMinor} >= 0`),
    check("installments_preterminated_after_purchase", sql`${t.preterminatedOn} is null or ${t.preterminatedOn} >= ${t.purchasedOn}`),
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
    /** The credit card it was charged to; null = cash or debit. Only expenses go on a card. */
    cardId: integer("card_id").references(() => creditCards.id, { onDelete: "restrict" }),
    /** Set on the auto-generated, read-only expense for one billed month of an installment plan. */
    installmentId: integer("installment_id").references((): AnySQLiteColumn => installments.id, { onDelete: "cascade" }),
    installmentSeq: integer("installment_seq"),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_occurred_on_idx").on(t.occurredOn),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_card_occurred_on_idx").on(t.cardId, t.occurredOn),
    // One transaction per billed schedule entry: makes generating them idempotent.
    uniqueIndex("transactions_installment_seq_unique").on(t.installmentId, t.installmentSeq),
    check("transactions_amount_positive", sql`${t.amountMinor} > 0`),
    check("transactions_card_expense_only", sql`${t.cardId} is null or ${t.type} = 'expense'`),
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
