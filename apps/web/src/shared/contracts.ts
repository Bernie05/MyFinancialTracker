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

// People and splits ----------------------------------------------------------

/**
 * Who a transaction or installment plan is for (see shared/split.ts): null = all yours. Each part is a
 * person (personId, or null for you) and a value: ignored for equal, a weight for shares, centavos for amounts.
 */
export const splitSchema = z
  .object({
    mode: z.enum(["equal", "shares", "amounts"]),
    parts: z
      .array(z.object({ personId: z.number().int().positive().nullable(), value: z.number().int().min(0).max(MAX_MINOR) }))
      .min(1, "Pick at least one person.")
      .max(12, "Split between at most 12 people."),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<number | null>();
    v.parts.forEach((p, i) => {
      if (seen.has(p.personId)) ctx.addIssue({ code: "custom", path: ["parts", i, "personId"], message: "Each person can appear once." });
      seen.add(p.personId);
      if (v.mode === "shares" && (p.value < 1 || p.value > 1000)) ctx.addIssue({ code: "custom", path: ["parts", i, "value"], message: "Shares are whole numbers from 1 to 1000." });
      if (v.mode === "amounts" && p.value < 1) ctx.addIssue({ code: "custom", path: ["parts", i, "value"], message: "Each amount must be above ₱0." });
    });
  });
export type SplitInput = z.infer<typeof splitSchema>;

const personNameSchema = z.string().trim().min(1, "Add a name.").max(40, "Keep it under 40 characters.");

export const personSchema = z.object({ id: z.number().int(), name: z.string(), archived: z.boolean() });
export type Person = z.infer<typeof personSchema>;

/**
 * A person with what they owe you. `balanceMinor` is what's billed so far minus repayments; installment
 * months not billed yet are in `upcomingMinor`, so `toPayOffMinor` = balance + upcoming.
 */
export const personSummarySchema = personSchema.extend({
  chargedMinor: z.number().int(),
  /** Their part of one-time (straight) charges. */
  straightMinor: z.number().int(),
  /** Their part of installment months billed so far. */
  installmentBilledMinor: z.number().int(),
  repaidMinor: z.number().int(),
  balanceMinor: z.number().int(),
  /** Their part of installment months still to be billed. */
  upcomingMinor: z.number().int(),
  /** Their part of one regular month across active plans. */
  monthlyMinor: z.number().int(),
  toPayOffMinor: z.number().int(),
  activePlans: z.number().int(),
  shareCount: z.number().int(),
  /** Unpaid from billings whose due date has passed. */
  overdueMinor: z.number().int(),
  /** The next unpaid billing that isn't past due yet (with anything carried into it). */
  nextDue: z.object({ dueDate: dateSchema, amountMinor: z.number().int() }).nullable(),
});
export type PersonSummary = z.infer<typeof personSummarySchema>;

export const newPersonSchema = z.object({ name: personNameSchema });
export type NewPerson = z.input<typeof newPersonSchema>;
export const updatePersonSchema = z
  .object({ name: personNameSchema, archived: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.");
export type UpdatePerson = z.input<typeof updatePersonSchema>;

export const personPaymentSchema = z.object({
  id: z.number().int(),
  personId: z.number().int(),
  amountMinor: z.number().int(),
  paidOn: dateSchema,
  note: z.string().nullable(),
  /** What this repayment is for: a plan (`p<installmentId>`), one month of it (`p<installmentId>-<seq>`), a charge (`t<transactionId>`), or null for whatever is oldest. */
  itemKey: z.string().nullable(),
});
export type PersonPayment = z.infer<typeof personPaymentSchema>;
export const newPersonPaymentSchema = z.object({
  amountMinor: amountMinorSchema,
  paidOn: dateSchema,
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
  itemKey: z
    .string()
    .regex(/^(p\d{1,12}(-\d{1,4})?|t\d{1,12})$/, "Pick an item from the list.")
    .nullish()
    .transform((v) => v ?? null),
});
export type NewPersonPayment = z.input<typeof newPersonPaymentSchema>;

/** One charge a person has a part of. */
export const personShareSchema = z.object({
  transactionId: z.number().int(),
  occurredOn: dateSchema,
  description: z.string(),
  totalMinor: z.number().int(),
  amountMinor: z.number().int(),
  card: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  installmentId: z.number().int().nullable(),
  installmentSeq: z.number().int().nullable(),
});
export type PersonShare = z.infer<typeof personShareSchema>;

/** An installment plan a person has a part of, with their part of it. */
export const personPlanSchema = z.object({
  installmentId: z.number().int(),
  cardId: z.number().int(),
  cardName: z.string(),
  description: z.string(),
  months: z.number().int(),
  monthsBilled: z.number().int(),
  /** Their part of a regular month. */
  monthlyMinor: z.number().int(),
  billedMinor: z.number().int(),
  upcomingMinor: z.number().int(),
  /** When their next part is billed; null once the plan is done. */
  nextBilledOn: dateSchema.nullable(),
  status: z.enum(["active", "completed"]),
});
export type PersonPlan = z.infer<typeof personPlanSchema>;

/**
 * One billing: a person's charges on one card statement (or, for cash/debit, one month), due on one date.
 * Repayments settle billings oldest first. An unpaid billing whose due date has passed is "unpaid", and
 * what's left of it carries into the next billing (`carriedInMinor`).
 */
export const personBillingSchema = z.object({
  key: z.string(),
  cardId: z.number().int().nullable(),
  cardName: z.string().nullable(),
  /** The statement close, or null for cash/debit. */
  closeDate: dateSchema.nullable(),
  dueDate: dateSchema,
  items: z.array(
    z.object({
      key: z.string(),
      occurredOn: dateSchema,
      description: z.string(),
      totalMinor: z.number().int(),
      /** This person's part. */
      amountMinor: z.number().int(),
      installmentId: z.number().int().nullable(),
      /** An installment month not billed yet (it's on a future statement). */
      upcoming: z.boolean(),
      /** Fully covered by their repayments (each item's own first, then the rest oldest first). */
      paid: z.boolean(),
      /** Stable across billing: `p<installmentId>-<seq>` for an installment month, else `t<transactionId>`. */
      monthKey: z.string(),
      /** How much of `amountMinor` their repayments cover. */
      paidMinor: z.number().int(),
    }),
  ),
  amountMinor: z.number().int(),
  paidMinor: z.number().int(),
  remainingMinor: z.number().int(),
  /** Unpaid amounts from earlier billings now due with this one. */
  carriedInMinor: z.number().int(),
  /** What "Paid" pays: this billing plus everything unpaid before it. */
  payMinor: z.number().int(),
  status: z.enum(["paid", "partial", "due", "unpaid"]),
  /** For an unpaid past-due billing: the due date of the billing it moved to. */
  movedTo: dateSchema.nullable(),
});
export type PersonBilling = z.infer<typeof personBillingSchema>;

export const personDetailSchema = personSummarySchema.extend({
  shares: z.array(personShareSchema),
  payments: z.array(personPaymentSchema),
  plans: z.array(personPlanSchema),
  /** Oldest first, including upcoming installment months (as future billings). */
  billings: z.array(personBillingSchema),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

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
  /** Who it's for; null = all yours. */
  split: splitSchema.nullable(),
  /** Your part of the amount (what reports count). */
  myShareMinor: z.number().int(),
  /** Everyone else's part, with their names. */
  shares: z.array(z.object({ personId: z.number().int(), name: z.string(), amountMinor: z.number().int() })),
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
  /** Who it's for (expenses only); null or absent = all yours. */
  split: splitSchema.nullish().transform((v) => v ?? null),
});
export type NewTransaction = z.input<typeof newTransactionSchema>;

/** PATCH body: any of the editable fields (the type stays; a category or card must suit it). */
export const updateTransactionSchema = z
  .object({
    amountMinor: amountMinorSchema,
    description: z.string().trim().min(1, "Add a description.").max(120, "Keep it under 120 characters."),
    categoryId: z.number().int().positive("Choose a category."),
    occurredOn: dateSchema,
    note: z.string().trim().max(500).nullable().transform((v) => v || null),
    cardId: z.number().int().positive().nullable(),
    split: splitSchema.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.");
export type UpdateTransaction = z.input<typeof updateTransactionSchema>;

/**
 * How an expense was paid: "cash" = no card (cash, debit, e-wallet balance); "bank" = a bank credit card;
 * "online" = an online credit line (SPayLater, Lazada PayLater, Home Credit).
 */
export const paidWithSchema = z.enum(["cash", "bank", "online"]);
export type PaidWith = z.infer<typeof paidWithSchema>;

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
    /** "cash": not charged to any card (cash, debit, e-wallet balance). */
    paidWith: paidWithSchema.optional(),
    /** Leaves out this category and its subcategories (Other Income leaves out Salary). */
    excludeCategoryId: idSchema.optional(),
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
  /** Per-day totals (over every matching row) for each date that appears on this page, newest first. */
  days: z.array(z.object({ date: z.string(), count: z.number().int(), incomeMinor: z.number().int(), expenseMinor: z.number().int() })),
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
  /** Up to five years, for the dashboard's yearly view. */
  months: z.coerce.number().int().min(1).max(60).default(6),
  cardId: idSchema.optional(),
  /** Only this category (and its subcategories): Salary on the Income overview. */
  categoryId: idSchema.optional(),
  /** Everything but this category tree: other income. */
  excludeCategoryId: idSchema.optional(),
  /** Only expenses paid this way (see paidWithSchema). */
  paidWith: paidWithSchema.optional(),
});
export type MonthlyFilters = Pick<z.output<typeof monthlyQuerySchema>, "cardId" | "categoryId" | "excludeCategoryId" | "paidWith">;

export const monthTotalsSchema = z.object({
  month: monthSchema,
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
});
export type MonthTotals = z.infer<typeof monthTotalsSchema>;

/** `?from=YYYY-MM&to=YYYY-MM`: whole calendar months, both ends included (a quarter, a year). At most ten years. */
export const rangeQuerySchema = z
  .object({ from: monthSchema, to: monthSchema })
  .refine((v) => v.from <= v.to, { path: ["to"], message: "The end month is before the start month." })
  .refine((v) => Number(v.to.slice(0, 4)) - Number(v.from.slice(0, 4)) < 10, { path: ["from"], message: "Pick at most ten years." });

/** A summary over several months: the same totals and category split as a month's, labelled by its first and last month. */
export const rangeSummarySchema = monthSummarySchema.omit({ month: true }).extend({ from: monthSchema, to: monthSchema });
export type RangeSummary = z.infer<typeof rangeSummarySchema>;

// Credit cards ----------------------------------------------------------------

const dayOfMonthSchema = (what: string) =>
  z.coerce.number().int().min(1, `${what} is a day from 1 to 31.`).max(31, `${what} is a day from 1 to 31.`);

const notifyDaysSchema = z.coerce.number().int().min(0, "Use 0 to 30 days.").max(30, "Use 0 to 30 days.");

/** One installment term the card offers and its monthly add-on rate (0.79% a month = 79 bps). */
export const installmentRateSchema = z.object({
  months: z.coerce.number().int("Use whole months.").min(1, "Use 1 to 60 months.").max(60, "Use 1 to 60 months."),
  addOnRateBps: z.coerce.number().int().min(0, "The rate can't be negative.").max(500, "Use at most 5% a month."),
});
export type InstallmentRate = z.infer<typeof installmentRateSchema>;

/** A card's rate table: one rate per term, kept sorted by months. */
export const installmentRatesSchema = z
  .array(installmentRateSchema)
  .max(24, "Keep it to 24 terms.")
  .superRefine((rates, ctx) => {
    const seen = new Set<number>();
    rates.forEach((r, i) => {
      if (seen.has(r.months)) ctx.addIssue({ code: "custom", path: [i, "months"], message: `${r.months} months is listed twice.` });
      seen.add(r.months);
    });
  })
  .transform((rates) => [...rates].sort((a, b) => a.months - b.months));

// Shared fields; defaults belong only to create, so a PATCH never resets a field it didn't send.
/** "bank": a bank-issued credit card (BPI, Metrobank). "online": an online credit line (SPayLater, Lazada PayLater, Home Credit). */
export const cardKinds = ["bank", "online"] as const;
export const cardKindSchema = z.enum(cardKinds);
export type CardKind = z.infer<typeof cardKindSchema>;

const cardFields = z.object({
  kind: cardKindSchema,
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
  installmentRates: installmentRatesSchema,
  /** Who usually uses the card (their charges start out as theirs); null = you. */
  defaultPersonId: z.number().int().positive().nullable(),
});

export const newCardSchema = cardFields.extend({
  kind: cardKindSchema.default("bank"),
  notifyDays: notifyDaysSchema.default(3),
  installmentRates: installmentRatesSchema.default([]),
  defaultPersonId: z.number().int().positive().nullish().transform((v) => v ?? null),
});
export type NewCard = z.input<typeof newCardSchema>;

export const updateCardSchema = cardFields
  .partial()
  .extend({ archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Change at least one field.");
export type UpdateCard = z.input<typeof updateCardSchema>;

export const cardStatusSchema = z.enum(["upcoming", "due_soon", "overdue", "paid"]);

export const cardSchema = z.object({
  id: z.number().int(),
  kind: cardKindSchema,
  name: z.string(),
  issuer: z.string().nullable(),
  last4: z.string().nullable(),
  limitMinor: z.number().int(),
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  notifyDays: z.number().int(),
  color: z.string(),
  archived: z.boolean(),
  /** Terms the card offers and their rates; the installment form pre-fills the rate from these. */
  installmentRates: z.array(installmentRateSchema),
  defaultPersonId: z.number().int().nullable(),
});
export type Card =z.infer<typeof cardSchema>;

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

/** What kind of loan a plan is. Null = an ordinary installment purchase. */
export const loanTypes = ["online", "bank", "personal", "debit"] as const;
export const loanTypeSchema = z.enum(loanTypes);
export type LoanType = z.infer<typeof loanTypeSchema>;
export const loanTypeLabels: Record<LoanType, string> = {
  online: "Online loan",
  bank: "Bank credit loan",
  personal: "Personal loan",
  debit: "Debit card",
};

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
  /** Who the plan is for; each billed month splits the same way. Null = all yours. */
  split: splitSchema.nullable(),
  /** Set when the plan is a loan (SLoan, a bank cash loan…); null = an installment purchase. */
  loanType: loanTypeSchema.nullable(),
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
    split: splitSchema.nullish().transform((v) => v ?? null),
    loanType: loanTypeSchema.nullish().transform((v) => v ?? null),
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
  split: splitSchema.nullable(),
  loanType: loanTypeSchema.nullable(),
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

// Accounts --------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .pipe(z.email("Enter an email like you@example.com."));

/** Login: no strength rules here (an old password must still work); register checks those on the server. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200, "That password is too long."),
});
export type Credentials = z.input<typeof credentialsSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(200, "Use at most 200 characters."),
});
export type ChangePassword = z.input<typeof changePasswordSchema>;

export const userSchema = z.object({ id: z.number().int(), email: z.string() });
export type User = z.infer<typeof userSchema>;

// Salary ----------------------------------------------------------------------

/** What comes off a payslip. The four statutory ones appear once each; "other" can repeat (loans, HMO, union dues). */
export const salaryDeductionKinds = ["tax", "sss", "philhealth", "pagibig", "other"] as const;
export const salaryDeductionKindSchema = z.enum(salaryDeductionKinds);
export type SalaryDeductionKind = z.infer<typeof salaryDeductionKindSchema>;
export const salaryBasisSchema = z.enum(["monthly", "annual"]);
export type SalaryBasis = z.infer<typeof salaryBasisSchema>;

export const salaryDeductionSchema = z.object({
  kind: salaryDeductionKindSchema,
  name: z.string().trim().min(1, "Name this deduction.").max(60, "Keep the name under 60 characters."),
  /** Per month. Zero is allowed: a contribution you don't pay yet keeps its row. */
  amountMinor: z.number().int("Amounts are whole centavos.").min(0, "Use ₱0 or more.").max(MAX_MINOR, "That amount is too large."),
});
export type SalaryDeduction = z.infer<typeof salaryDeductionSchema>;

/** `basis` is how you entered the gross pay: "monthly" (₱50,000 a month) or "annual" (₱600,000 a year). Deductions are always per month. */
export const salaryInputSchema = z
  .object({
    basis: salaryBasisSchema,
    grossMinor: amountMinorSchema,
    deductions: z.array(salaryDeductionSchema).max(30, "At most 30 deductions."),
  })
  .superRefine((v, ctx) => {
    for (const kind of ["tax", "sss", "philhealth", "pagibig"] as const) {
      if (v.deductions.filter((d) => d.kind === kind).length > 1) {
        ctx.addIssue({ code: "custom", path: ["deductions"], message: `List each statutory deduction once (${kind} appears twice).` });
      }
    }
  });
export type SalaryInput = z.input<typeof salaryInputSchema>;

export const salaryProfileSchema = z.object({
  basis: salaryBasisSchema,
  grossMinor: z.number().int(),
  deductions: z.array(salaryDeductionSchema),
});
export type SalaryProfile = z.infer<typeof salaryProfileSchema>;

/** GET /api/salary: `profile` is null until you set it up. */
export const salaryResponseSchema = z.object({ profile: salaryProfileSchema.nullable() });

// Errors ----------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    /** Field path → message, for form validation errors. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// Budgets ---------------------------------------------------------------------

/**
 * A standing monthly budget on a top-level expense category: Cash & Others shows budget − spent = left,
 * the way a credit section shows limit − used = available.
 */
export const budgetSchema = z.object({ categoryId: idSchema, limitMinor: z.number().int() });
export type Budget = z.infer<typeof budgetSchema>;
/** null clears the budget. */
export const budgetInputSchema = z.object({ limitMinor: amountMinorSchema.nullable() });
export type BudgetInput = z.infer<typeof budgetInputSchema>;

/** A card on Cash & Others: one picked top-level expense category. */
export const cashCardSchema = z.object({ categoryId: idSchema });
export type CashCard = z.infer<typeof cashCardSchema>;

/** The main monthly budget for all of Cash & Others (null = not set). PUT takes budgetInputSchema. */
export const monthlyBudgetSchema = z.object({ limitMinor: z.number().int().nullable() });
export type MonthlyBudget = z.infer<typeof monthlyBudgetSchema>;
