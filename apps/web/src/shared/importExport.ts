/**
 * Excel export / import: the workbook's columns and the JSON that travels between client and server.
 *
 * The browser builds and reads the .xlsx (SheetJS); the server never sees a file, only rows as JSON
 * (so the CSRF rule "state-changing requests carry JSON" holds). The server does all validation and
 * name → id mapping, so the rules live in one place.
 */
import { z } from "zod";
import { cardSchema, categoryListItemSchema, categorySchema, dateSchema, monthSchema, personSchema, splitSchema, transactionSchema } from "./contracts";

export type CellKind = "text" | "id" | "date" | "month" | "money" | "number";

export interface Column<K extends string = string> {
  key: K;
  /** Header written on export. */
  header: string;
  kind: CellKind;
  /** Other headers that map to this column on import (compared lowercased, letters and digits only). */
  aliases: readonly string[];
  width: number;
}

/** "For": who it's for. Blank = you; "Ana"; "Me, Ana" (equal); "Me:2, Ana:1" (shares); "Me=500, Ana=700" (amounts). */
const FOR_ALIASES = ["split", "split with", "person", "people", "who", "for whom", "assigned to", "used by"];

export const TRANSACTIONS_SHEET = "Transactions";
export const INSTALLMENTS_SHEET = "Installments";

export const transactionColumns = [
  { key: "id", header: "ID", kind: "id", aliases: ["id", "transaction id"], width: 8 },
  { key: "date", header: "Date", kind: "date", aliases: ["occurred on", "transaction date", "posting date", "posted"], width: 12 },
  { key: "type", header: "Type", kind: "text", aliases: ["kind", "income or expense"], width: 10 },
  { key: "description", header: "Description", kind: "text", aliases: ["details", "item", "particulars", "name"], width: 34 },
  { key: "amount", header: "Amount", kind: "money", aliases: ["value", "price", "total", "amount php"], width: 14 },
  { key: "category", header: "Category", kind: "text", aliases: ["parent category", "main category"], width: 20 },
  { key: "subcategory", header: "Subcategory", kind: "text", aliases: ["sub category", "sub", "child category"], width: 20 },
  { key: "card", header: "Paid with", kind: "text", aliases: ["card", "credit card", "payment method", "account"], width: 16 },
  { key: "for", header: "For", kind: "text", aliases: FOR_ALIASES, width: 22 },
  { key: "note", header: "Note", kind: "text", aliases: ["notes", "memo", "remarks", "comment"], width: 30 },
] as const satisfies readonly Column[];

export const installmentColumns = [
  { key: "id", header: "ID", kind: "id", aliases: ["id", "plan id", "installment id"], width: 8 },
  { key: "card", header: "Card", kind: "text", aliases: ["credit card", "paid with"], width: 16 },
  { key: "for", header: "For", kind: "text", aliases: FOR_ALIASES, width: 22 },
  { key: "description", header: "Description", kind: "text", aliases: ["what did you buy", "item", "details", "name"], width: 30 },
  { key: "category", header: "Category", kind: "text", aliases: ["parent category", "main category"], width: 18 },
  { key: "subcategory", header: "Subcategory", kind: "text", aliases: ["sub category", "sub", "child category"], width: 18 },
  { key: "purchasedOn", header: "Purchase date", kind: "date", aliases: ["purchased on", "purchased", "date"], width: 13 },
  { key: "price", header: "Price", kind: "money", aliases: ["principal", "price principal", "amount"], width: 14 },
  { key: "months", header: "Months", kind: "number", aliases: ["term", "terms", "term months"], width: 8 },
  { key: "rate", header: "Add-on rate (% a month)", kind: "number", aliases: ["rate", "add on rate", "addon rate", "interest", "interest rate"], width: 12 },
  { key: "monthly", header: "Bank's monthly amount", kind: "money", aliases: ["monthly", "monthly amount", "amortization", "banks monthly"], width: 14 },
  { key: "fee", header: "Processing fee", kind: "money", aliases: ["fee"], width: 12 },
  { key: "firstBilled", header: "First billed", kind: "month", aliases: ["first billed on", "first billing month", "first billing"], width: 12 },
  { key: "preterminatedOn", header: "Pre-terminated on", kind: "date", aliases: ["preterminated on", "preterminated", "pretermination"], width: 14 },
] as const satisfies readonly Column[];

export type TransactionColumnKey = (typeof transactionColumns)[number]["key"];
export type InstallmentColumnKey = (typeof installmentColumns)[number]["key"];

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps a sheet's header row to column keys; unknown headers are ignored. */
export function matchHeaders<C extends readonly Column[]>(headers: string[], columns: C) {
  const map = new Map<number, C[number]["key"]>();
  const used = new Set<string>();
  headers.forEach((h, i) => {
    const n = normalizeHeader(h ?? "");
    if (!n) return;
    const col = columns.find((c) => !used.has(c.key) && (normalizeHeader(c.header) === n || c.aliases.some((a) => normalizeHeader(a) === n)));
    if (col) {
      map.set(i, col.key);
      used.add(col.key);
    }
  });
  return map;
}

// Wire format ------------------------------------------------------------------

/** One cell as the client sends it: dates already `YYYY-MM-DD`, months `YYYY-MM`, the rest as typed. */
// Long enough that an over-long note or description is reported on its row, not as a refused request.
const cellSchema = z.union([z.string().max(2000), z.number(), z.null()]).optional();

/** `row` is the spreadsheet row number, so errors can point at it. */
export const importRowSchema = z.object({ row: z.number().int().positive() }).catchall(cellSchema);
export type ImportRow = z.infer<typeof importRowSchema>;

export const MAX_IMPORT_ROWS = 5000;

export const importRequestSchema = z.object({
  /** false: check and preview only; true: apply (only when there are no errors). */
  commit: z.boolean(),
  transactions: z.array(importRowSchema).max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} transactions at a time.`),
  installments: z.array(importRowSchema).max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} installments at a time.`),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

const countsSchema = z.object({ added: z.number().int(), updated: z.number().int(), unchanged: z.number().int() });

export const importReportSchema = z.object({
  committed: z.boolean(),
  transactions: countsSchema,
  installments: countsSchema,
  /** Categories the import creates (or created), as "Parent" or "Parent › Child", with their type. */
  newCategories: z.array(z.object({ path: z.string(), type: z.enum(["expense", "income"]) })),
  /** People the "For" column names who aren't on your list yet: the import adds them. */
  newPeople: z.array(z.string()),
  errors: z.array(z.object({ sheet: z.enum([TRANSACTIONS_SHEET, INSTALLMENTS_SHEET]), row: z.number().int(), message: z.string() })),
});
export type ImportReport = z.infer<typeof importReportSchema>;

/** GET /api/export: everything the workbook needs. Installment-generated months are left out (they're derived). */
export const exportDataSchema = z.object({
  transactions: z.array(transactionSchema),
  installments: z.array(
    z.object({
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
    }),
  ),
  categories: z.array(categoryListItemSchema),
  cards: z.array(cardSchema),
  people: z.array(personSchema),
});
export type ExportData = z.infer<typeof exportDataSchema>;

// Cell parsing (server side) -----------------------------------------------------

/** Pesos (a number from Excel, or text like "₱1,250.50") → centavos. Null when blank; NaN when not an amount. */
export function cellToMinor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : Number.NaN;
  const cleaned = v.replace(/[₱,\s]/g, "").replace(/^php/i, "");
  if (cleaned === "") return null;
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return Number.NaN;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Trimmed text, or "" for a blank cell. */
export const cellText = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v).trim());

/** A plain number ("0.79", 12); null when blank, NaN when not a number. */
export function cellNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const t = v.replace(/[%,\s]/g, "");
  return t === "" ? null : Number(t);
}

/** Excel's day number (days since 1899-12-30) for a calendar date, and back. */
const EPOCH = Date.UTC(1899, 11, 30);
export const dateToSerial = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return (Date.UTC(y, m - 1, d ?? 1) - EPOCH) / 86_400_000;
};
export function serialToDate(serial: number) {
  const d = new Date(EPOCH + Math.round(serial) * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
