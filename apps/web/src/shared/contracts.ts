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

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: transactionTypeSchema,
  color: z.number().int().min(1).max(6),
});
export type Category = z.infer<typeof categorySchema>;

// Transactions ----------------------------------------------------------------

export const transactionSchema = z.object({
  id: z.number().int(),
  type: transactionTypeSchema,
  amountMinor: z.number().int(),
  description: z.string(),
  occurredOn: dateSchema,
  note: z.string().nullable(),
  category: categorySchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

export const newTransactionSchema = z.object({
  type: transactionTypeSchema,
  amountMinor: amountMinorSchema,
  description: z.string().trim().min(1, "Add a description.").max(120, "Keep it under 120 characters."),
  categoryId: z.number().int().positive("Choose a category."),
  occurredOn: dateSchema,
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});
export type NewTransaction = z.input<typeof newTransactionSchema>;

export const transactionListQuerySchema = z.object({ month: monthSchema });

// Summary ---------------------------------------------------------------------

export const categoryTotalSchema = z.object({
  category: categorySchema,
  totalMinor: z.number().int(),
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

// Errors ----------------------------------------------------------------------

export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    /** Field path → message, for form validation errors. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
