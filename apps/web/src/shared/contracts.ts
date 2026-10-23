/**
 * API contracts shared by server and client.
 *
 * The server validates every request body and query with these schemas; the client
 * validates every response with them. One definition, checked on both sides of the wire,
 * means the shapes can't drift apart.
 */
import { z } from "zod";

/** Largest amount we accept: ₱10 billion in centavos. Keeps sums far below Number.MAX_SAFE_INTEGER. */
const MAX_MINOR = 1_000_000_000_000;

export const transactionTypeSchema = z.enum(["expense", "income"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

/** A calendar month, `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the YYYY-MM format.");
export type Month = z.infer<typeof monthSchema>;

/** A calendar date, `YYYY-MM-DD`, that actually exists (rejects 2026-02-30). */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "That date doesn't exist.");

export const amountMinorSchema = z
  .number()
  .int("Amounts are whole centavos.")
  .positive("Enter an amount above ₱0.")
  .max(MAX_MINOR, "That amount is too large.");

export const idSchema = z.coerce.number().int().positive();

// Categories ------------------------------------------------------------------

/** Preset category colors; each is a `--cat-<key>` token in @mft/ui, tuned for light and dark. */
export const categoryColorPresets = [
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "grey",
] as const;
export type CategoryColorPreset = (typeof categoryColorPresets)[number];

/** Light-theme value of each preset. Must match the `cat-*` tokens in packages/ui/src/tokens/tokens.ts. */
const presetLightHex: Record<CategoryColorPreset, string> = {
  red: "#cf3a3a",
  orange: "#d0582a",
  amber: "#e0a526",
  yellow: "#d4b106",
  green: "#1f8a68",
  teal: "#0f8b9c",
  blue: "#2a78d6",
  indigo: "#4f5bd5",
  purple: "#8a63c9",
  pink: "#e87ba4",
  brown: "#8d6142",
  grey: "#7a8494",
};

/**
 * What a color actually looks like, for uniqueness: a preset is its light value, a custom color its hex.
 * So "#cf3a3a" and "red" count as the same color.
 */
export const colorIdentity = (color: string) =>
  color.startsWith("#") ? color.toLowerCase() : (presetLightHex[color as CategoryColorPreset] ?? color);

/** The category (other than `exceptId`) already using `color`, if any. */
export const colorOwner = <T extends { id: number; color: string }>(all: T[], color: string, exceptId?: number) =>
  all.find((c) => c.id !== exceptId && colorIdentity(c.color) === colorIdentity(color));

/** A preset key, or a custom color as `#rrggbb` (stored lowercase). The DB enforces the same rule. */
export const categoryColorSchema = z.union([
  z.enum(categoryColorPresets),
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a preset or enter a color like #c0392b.")
    .transform((v) => v.toLowerCase()),
], { error: "Pick a preset or enter a color like #c0392b." });

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: transactionTypeSchema,
  /** The color to draw with: a parent's own, or a subcategory's inherited from its parent. */
  color: z.string(),
  /** Null for a top-level (parent) category. */
  parentId: z.number().int().nullable(),
});
export type Category = z.infer<typeof categorySchema>;

/** GET /api/categories rows: the category plus how many transactions use it. */
export const categoryListItemSchema = categorySchema.extend({ transactionCount: z.number().int() });
export type CategoryListItem = z.infer<typeof categoryListItemSchema>;

const categoryNameSchema = z.string().trim().min(1, "Add a name.").max(40, "Keep it under 40 characters.");

/**
 * POST body. A parent needs a color; a subcategory names its parent instead (and takes the parent's type
 * and color). One level only.
 */
export const newCategorySchema = z
  .object({
    name: categoryNameSchema,
    type: transactionTypeSchema,
    color: categoryColorSchema.optional(),
    parentId: z.number().int().positive().nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.parentId !== null || v.color !== undefined, { path: ["color"], message: "Pick a color." });
export type NewCategory = z.input<typeof newCategorySchema>;

/** PATCH body: any subset of the fields, at least one. `parentId: null` makes it top level (it then needs a color). */
export const updateCategorySchema = z
  .object({
    name: categoryNameSchema,
    type: transactionTypeSchema,
    color: categoryColorSchema,
    parentId: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.");
export type UpdateCategory = z.input<typeof updateCategorySchema>;

/**
 * DELETE query. `moveTo`: where its transactions and installment plans go, if it has any.
 * For a parent with subcategories, either `childrenTo` (another parent to move them under) or
 * `deleteChildren=1` (only when none of them is used).
 */
export const deleteCategoryQuerySchema = z.object({
  moveTo: idSchema.optional(),
  childrenTo: idSchema.optional(),
  deleteChildren: z.enum(["1"]).optional(),
});

// Transactions ----------------------------------------------------------------

export const transactionSchema = z.object({
  id: z.number().int(),
  type: transactionTypeSchema,
  amountMinor: z.number().int(),
  description: z.string(),
  occurredOn: dateSchema,
  note: z.string().nullable(),
  category: categorySchema,
  /** The credit card it was charged to, or null for cash/debit. */
  card: z.object({ id: z.number().int(), name: z.string(), last4: z.string().nullable(), color: z.string() }).nullable(),
  /** Set when this is one billed month of an installment plan: read-only, managed by the plan. */
  installmentId: z.number().int().nullable(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const newTransactionSchema = z.object({
  type: transactionTypeSchema,
  amountMinor: amountMinorSchema,
  description: z.string().trim().min(1, "Add a description.").max(120, "Keep it under 120 characters."),
  categoryId: z.number().int().positive("Choose a category."),
  occurredOn: dateSchema,
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
  /** "Paid with": a credit card id, or null/absent for cash or debit. Expenses only. */
  cardId: z.number().int().positive().nullish().transform((v) => v ?? null),
});
export type NewTransaction = z.input<typeof newTransactionSchema>;

/** `cardId` narrows a summary to one credit card's charges. */
export const monthQuerySchema = z.object({ month: monthSchema, cardId: idSchema.optional() });

export const MAX_PAGE_SIZE = 100;

/** GET /api/transactions query. Every filter is optional; `from`/`to` are inclusive dates. */
export const transactionQuerySchema = z
  .object({
    type: transactionTypeSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    categoryId: idSchema.optional(),
    cardId: idSchema.optional(),
    /** "none": regular charges only; "only": billed installment months only. */
    installment: z.enum(["none", "only"]).optional(),
    q: z.string().trim().max(100, "Keep the search under 100 characters.").optional().transform((v) => v || undefined),
    page: z.coerce.number().int().min(1, "Pages start at 1.").default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE, `At most ${MAX_PAGE_SIZE} per page.`).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ["to"], message: "The end date is before the start date." });
export type TransactionQuery = z.output<typeof transactionQuerySchema>;
export type TransactionFilters = Partial<z.input<typeof transactionQuerySchema>>;

export const transactionPageSchema = z.object({
  items: z.array(transactionSchema),
  /** Rows matching the filters, across all pages. */
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  /** Sums over every matching row, not just this page. */
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
});
export type TransactionPage = z.infer<typeof transactionPageSchema>;

// Summary ---------------------------------------------------------------------

/**
 * Spending for one parent category, with its breakdown. `children` lists each subcategory with spending,
 * plus the parent itself when something was booked on it directly. Empty when it has no subcategories.
 */
export const categoryTotalSchema = z.object({
  category: categorySchema,
  totalMinor: z.number().int(),
  children: z.array(z.object({ category: categorySchema, totalMinor: z.number().int() })),
});

export const monthSummarySchema = z.object({
  month: monthSchema,
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
  /** income − expense; negative when you spent more than you earned. */
  netMinor: z.number().int(),
  expenseByCategory: z.array(categoryTotalSchema),
});
export type MonthSummary = z.infer<typeof monthSummarySchema>;

/** `?to=YYYY-MM&months=6`: the `months` calendar months ending with `to`, oldest first. */
export const monthlyQuerySchema = z.object({
  to: monthSchema,
  months: z.coerce.number().int().min(1).max(24).default(6),
  cardId: idSchema.optional(),
});

export const monthTotalsSchema = z.object({
  month: monthSchema,
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
});
export type MonthTotals = z.infer<typeof monthTotalsSchema>;

// Credit cards ----------------------------------------------------------------

const dayOfMonthSchema = (what: string) =>
  z.coerce.number().int().min(1, `${what} is a day from 1 to 31.`).max(31, `${what} is a day from 1 to 31.`);

const notifyDaysSchema = z.coerce.number().int().min(0, "Use 0 to 30 days.").max(30, "Use 0 to 30 days.");

// Shared fields; defaults belong only to create, so a PATCH never resets a field it didn't send.
const cardFields = z.object({
  name: z.string().trim().min(1, "Add a name.").max(40, "Keep it under 40 characters."),
  issuer: z.string().trim().max(40, "Keep it under 40 characters.").nullish().transform((v) => v || null),
  /** Only the last 4 digits, never a full card number. */
  last4: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .pipe(z.string().regex(/^\d{4}$/, "Enter exactly 4 digits, or leave it empty.").nullable()),
  limitMinor: amountMinorSchema,
  closingDay: dayOfMonthSchema("The statement day"),
  dueDay: dayOfMonthSchema("The due day"),
  notifyDays: notifyDaysSchema,
  color: categoryColorSchema,
});

export const newCardSchema = cardFields.extend({ notifyDays: notifyDaysSchema.default(3) });
export type NewCard = z.input<typeof newCardSchema>;

export const updateCardSchema = cardFields
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.");
export type UpdateCard = z.input<typeof updateCardSchema>;

export const cardStatusSchema = z.enum(["upcoming", "due_soon", "overdue", "paid"]);

export const cardSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  issuer: z.string().nullable(),
  last4: z.string().nullable(),
  limitMinor: z.number().int(),
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  notifyDays: z.number().int(),
  color: z.string(),
  archived: z.boolean(),
});
export type Card = z.infer<typeof cardSchema>;

/** A card with its statement math for today (see shared/cardCycle.ts). */
export const cardSummarySchema = cardSchema.extend({
  transactionCount: z.number().int(),
  summary: z.object({
    outstandingMinor: z.number().int(),
    availableMinor: z.number().int(),
    utilisationPct: z.number().int(),
    cycleFrom: dateSchema,
    cycleTo: dateSchema,
    cycleSpendMinor: z.number().int(),
    statementDate: dateSchema,
    statementMinor: z.number().int(),
    paidSinceStatementMinor: z.number().int(),
    remainingDueMinor: z.number().int(),
    dueDate: dateSchema,
    daysUntilDue: z.number().int(),
    status: cardStatusSchema,
    /** Sum of the regular monthly amounts of active installment plans. */
    installmentMonthlyTotalMinor: z.number().int(),
    /** Still to be billed across active plans (amortizations, fees, pre-terminations). */
    installmentRemainingMinor: z.number().int(),
    activeInstallments: z.number().int(),
  }),
});
export type CardSummary = z.infer<typeof cardSummarySchema>;

export const cardPaymentSchema = z.object({
  id: z.number().int(),
  cardId: z.number().int(),
  amountMinor: z.number().int(),
  paidOn: dateSchema,
  note: z.string().nullable(),
});
export type CardPayment = z.infer<typeof cardPaymentSchema>;

export const newCardPaymentSchema = z.object({
  amountMinor: amountMinorSchema,
  paidOn: dateSchema,
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});
export type NewCardPayment = z.input<typeof newCardPaymentSchema>;

// Installments ----------------------------------------------------------------

const installmentFields = z.object({
  description: z.string().trim().min(1, "Add a description.").max(80, "Keep it under 80 characters."),
  categoryId: z.number().int().positive("Choose a category."),
  purchasedOn: dateSchema,
  principalMinor: amountMinorSchema,
  months: z.coerce.number().int().min(1, "Use 1 to 60 months.").max(60, "Use 1 to 60 months."),
  /** Monthly add-on rate in basis points: 0.79% a month = 79. */
  addOnRateBps: z.coerce.number().int().min(0, "The rate can't be negative.").max(500, "Use at most 5% a month."),
  /** The bank's monthly figure, when it differs from the computed one. */
  amortizationMinor: amountMinorSchema.nullable(),
  feeMinor: z.number().int().min(0, "The fee can't be negative.").max(1_000_000_000_000),
  firstBillingMonth: monthSchema,
  /** Pre-termination date: the remaining principal is billed in that cycle. */
  preterminatedOn: dateSchema.nullable(),
});

const purchaseRules = <T extends { purchasedOn?: string; firstBillingMonth?: string; preterminatedOn?: string | null }>(v: T, ctx: z.RefinementCtx) => {
  if (v.purchasedOn && v.firstBillingMonth && v.firstBillingMonth < v.purchasedOn.slice(0, 7)) {
    ctx.addIssue({ code: "custom", path: ["firstBillingMonth"], message: "Billing can't start before the purchase month." });
  }
  if (v.purchasedOn && v.preterminatedOn && v.preterminatedOn < v.purchasedOn) {
    ctx.addIssue({ code: "custom", path: ["preterminatedOn"], message: "Pre-termination can't be before the purchase." });
  }
};

/** POST body. Rate and fee default to 0; the first billing month defaults to the next statement. */
export const newInstallmentSchema = installmentFields
  .extend({
    addOnRateBps: installmentFields.shape.addOnRateBps.default(0),
    amortizationMinor: installmentFields.shape.amortizationMinor.optional().transform((v) => v ?? null),
    feeMinor: installmentFields.shape.feeMinor.default(0),
    firstBillingMonth: monthSchema.optional(),
    preterminatedOn: dateSchema.nullish().transform((v) => v ?? null),
  })
  .superRefine(purchaseRules);
export type NewInstallment = z.input<typeof newInstallmentSchema>;

/** PATCH body: any subset (no defaults, so unsent fields stay). `preterminatedOn: null` undoes a pre-termination. */
export const updateInstallmentSchema = installmentFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.")
  .superRefine(purchaseRules);
export type UpdateInstallment = z.input<typeof updateInstallmentSchema>;

export const scheduleEntrySchema = z.object({
  seq: z.number().int(),
  kind: z.enum(["amortization", "fee", "pretermination"]),
  month: z.number().int().nullable(),
  billedOn: dateSchema,
  amountMinor: z.number().int(),
  principalMinor: z.number().int(),
  status: z.enum(["billed", "upcoming"]),
  remainingAfterMinor: z.number().int(),
});
export type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;

export const installmentSchema = z.object({
  id: z.number().int(),
  cardId: z.number().int(),
  description: z.string(),
  category: categorySchema,
  purchasedOn: dateSchema,
  principalMinor: z.number().int(),
  months: z.number().int(),
  addOnRateBps: z.number().int(),
  amortizationMinor: z.number().int().nullable(),
  feeMinor: z.number().int(),
  firstBillingMonth: monthSchema,
  preterminatedOn: dateSchema.nullable(),
  // Derived from the terms (shared/installments.ts):
  monthlyMinor: z.number().int(),
  totalMinor: z.number().int(),
  interestMinor: z.number().int(),
  monthsBilled: z.number().int(),
  remainingMinor: z.number().int(),
  unbilledPrincipalMinor: z.number().int(),
  firstBilledOn: dateSchema,
  endsOn: dateSchema,
  status: z.enum(["active", "completed"]),
});
export type Installment = z.infer<typeof installmentSchema>;

export const installmentDetailSchema = installmentSchema.extend({ schedule: z.array(scheduleEntrySchema) });
export type InstallmentDetail = z.infer<typeof installmentDetailSchema>;

/** A card that is due soon (within its notify window) or overdue, with money still owed. */
export const cardAlertSchema = z.object({
  cardId: z.number().int(),
  name: z.string(),
  last4: z.string().nullable(),
  color: z.string(),
  dueDate: dateSchema,
  daysUntilDue: z.number().int(),
  remainingDueMinor: z.number().int(),
  status: z.enum(["due_soon", "overdue"]),
});
export type CardAlert = z.infer<typeof cardAlertSchema>;

// Errors ----------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    /** Field path → message, for form validation errors. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
