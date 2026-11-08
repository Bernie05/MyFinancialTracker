/**
 * Builds the export workbook and reads an import workbook, in the browser (SheetJS).
 * Column definitions are shared with the server (shared/importExport.ts); the server does the
 * validation and the name → id mapping, this file only turns cells into plain values.
 */
import * as XLSX from "xlsx";
import type { Category } from "../../shared/contracts";
import { splitToText } from "../../shared/split";
import {
  dateToSerial,
  installmentColumns,
  INSTALLMENTS_SHEET,
  matchHeaders,
  normalizeHeader,
  serialToDate,
  transactionColumns,
  TRANSACTIONS_SHEET,
  type Column,
  type ExportData,
  type ImportRow,
} from "../../shared/importExport";

const LISTS_SHEET = "Lists";
const HELP_SHEET = "How to import";

const FORMATS: Partial<Record<Column["kind"], string>> = { date: "yyyy-mm-dd", month: "yyyy-mm", money: "#,##0.00" };

type Cell = string | number | null;

/** One sheet: header row, rows, then number formats, widths and a filter on the header. */
function sheet(columns: readonly Column[], rows: Cell[][]) {
  const ws = XLSX.utils.aoa_to_sheet([columns.map((c) => c.header), ...rows]);
  rows.forEach((row, r) =>
    columns.forEach((col, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
      const z = FORMATS[col.kind];
      if (cell && z && typeof row[c] === "number") cell.z = z;
    }),
  );
  ws["!cols"] = columns.map((c) => ({ wch: c.width }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: columns.length - 1 } }) };
  return ws;
}

/** Category and subcategory names for a category (a subcategory's parent goes in the first column). */
function names(category: Pick<Category, "id" | "name" | "parentId">, all: Category[]): [string, string] {
  if (category.parentId === null) return [category.name, ""];
  return [all.find((c) => c.id === category.parentId)?.name ?? "", category.name];
}

const help = [
  ["How to import"],
  [""],
  ["1. Edit the Transactions and Installments sheets. Keep the header row; column order doesn't matter, and extra columns are ignored."],
  ["2. A row with an ID updates that transaction or plan. Leave ID blank to add a new one. Deleting a row here doesn't delete anything in the app."],
  ["3. Category and Subcategory are matched by name. A name that doesn't exist yet is created (a new top-level category gets a free color)."],
  ["4. Paid with / Card must be one of your cards (by name, or its last 4 digits). Leave Paid with blank for cash or debit."],
  ["5. Type is Expense or Income (blank = Expense). Amounts are in pesos, e.g. 1250.50."],
  ['5b. For: who it\'s for. Blank = you. "Ana" = all Ana\'s. Split: "Me, Ana" (equally), "Me:2, Ana:1" (by shares), "Me=500, Ana=700" (exact amounts that add up to the total). New names are added to People.'],
  ["    A new row without a For column takes the card's usual person (set in the card). Expenses only."],
  ["6. Installments: Add-on rate is % a month (0 for a 0% plan; blank uses the card's rate for that term, set in the card's Installment rates). First billed is a month (YYYY-MM); leave it blank for the next statement."],
  ["7. In the app: Settings → Excel export and import → Import. You'll see a preview with any problems before anything is saved."],
  [""],
  ["Billed installment months aren't in the Transactions sheet: they're generated from each plan."],
  ["The Lists sheet shows your current categories and cards for reference; it isn't imported."],
];

/** The export workbook. With `blank`, only the headers and the reference lists (a template). */
export function buildWorkbook(data: ExportData, blank = false): ArrayBuffer {
  const { categories, cards } = data;
  const cardName = (id: number) => cards.find((c) => c.id === id)?.name ?? "";
  const personName = (id: number) => data.people.find((p) => p.id === id)?.name ?? "";

  const txRows: Cell[][] = blank
    ? []
    : data.transactions.map((t) => [
        t.id,
        dateToSerial(t.occurredOn),
        t.type === "income" ? "Income" : "Expense",
        t.description,
        t.amountMinor / 100,
        ...names(t.category, categories),
        t.card?.name ?? "",
        splitToText(t.split, personName),
        t.note ?? "",
      ]);
  const planRows: Cell[][] = blank
    ? []
    : data.installments.map((p) => [
        p.id,
        cardName(p.cardId),
        splitToText(p.split, personName),
        p.description,
        ...names(p.category, categories),
        dateToSerial(p.purchasedOn),
        p.principalMinor / 100,
        p.months,
        p.addOnRateBps / 100,
        p.amortizationMinor === null ? null : p.amortizationMinor / 100,
        p.feeMinor ? p.feeMinor / 100 : null,
        dateToSerial(`${p.firstBillingMonth}-01`),
        p.preterminatedOn ? dateToSerial(p.preterminatedOn) : null,
      ]);

  // Reference lists: every category path by type, then the cards.
  const parents = categories.filter((c) => c.parentId === null).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const lists: Cell[][] = [["Type", "Category", "Subcategory", "", "Card", "Last 4", "Status", "", "Person"]];
  const catRows: Cell[][] = parents.flatMap((p) => {
    const type = p.type === "income" ? "Income" : "Expense";
    const kids = categories.filter((c) => c.parentId === p.id).sort((a, b) => a.name.localeCompare(b.name));
    return [[type, p.name, ""], ...kids.map((k) => [type, p.name, k.name])];
  });
  const cardRows: Cell[][] = cards.map((c) => [c.name, c.last4 ?? "", c.archived ? "Archived" : "Active"]);
  const personRows = ["Me", ...data.people.filter((p) => !p.archived).map((p) => p.name)];
  for (let i = 0; i < Math.max(catRows.length, cardRows.length, personRows.length); i++) {
    lists.push([...(catRows[i] ?? ["", "", ""]), "", ...(cardRows[i] ?? ["", "", ""]), "", personRows[i] ?? ""]);
  }
  const listSheet = XLSX.utils.aoa_to_sheet(lists);
  listSheet["!cols"] = [{ wch: 10 }, { wch: 22 }, { wch: 22 }, { wch: 3 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 3 }, { wch: 18 }];
  const helpSheet = XLSX.utils.aoa_to_sheet(help);
  helpSheet["!cols"] = [{ wch: 120 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(transactionColumns, txRows), TRANSACTIONS_SHEET);
  XLSX.utils.book_append_sheet(wb, sheet(installmentColumns, planRows), INSTALLMENTS_SHEET);
  XLSX.utils.book_append_sheet(wb, listSheet, LISTS_SHEET);
  XLSX.utils.book_append_sheet(wb, helpSheet, HELP_SHEET);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Saves bytes as a file download. */
export function download(bytes: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reading ------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Text dates people type: 2026-11-08, 2026/11/08, 11/8/2026 (month first, like Excel here), 8-Nov-2026, Nov 8, 2026. */
function textToDate(s: string): string | null {
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(+m[1]!)}-${pad(+m[2]!)}`;
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[2]!.toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[2]!.toLowerCase()) + 1)}-${pad(+m[1]!)}`;
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[1]!.toLowerCase())) return `${m[3]}-${pad(MONTHS.indexOf(m[1]!.toLowerCase()) + 1)}-${pad(+m[2]!)}`;
  return null;
}

/** Months: 2026-12, 2026/12, Dec 2026, December 2026, or any full date. */
function textToMonth(s: string): string | null {
  let m = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2]!)}`;
  m = /^([a-z]{3})[a-z]*\.?[\s-]+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[1]!.toLowerCase())) return `${m[2]}-${pad(MONTHS.indexOf(m[1]!.toLowerCase()) + 1)}`;
  return textToDate(s)?.slice(0, 7) ?? null;
}

function convert(value: unknown, kind: Column["kind"]): Cell {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) value = dateToSerial(`${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`);
  if (typeof value === "boolean") value = String(value);
  if (typeof value === "number") {
    if (kind === "date") return serialToDate(value);
    if (kind === "month") return serialToDate(value).slice(0, 7);
    if (kind === "text") return String(value);
    return value;
  }
  const s = String(value).trim().slice(0, 2000);
  if (s === "") return null;
  if (kind === "date") return textToDate(s) ?? s;
  if (kind === "month") return textToMonth(s) ?? s;
  return s;
}

export interface SheetRead {
  /** The workbook sheet this came from, or null when none was found. */
  sheet: string | null;
  rows: ImportRow[];
  matched: string[];
  ignored: string[];
  /** Columns the import needs that the sheet doesn't have. */
  missing: string[];
}

const REQUIRED = {
  transactions: ["date", "description", "amount", "category"],
  installments: ["card", "description", "category", "purchasedOn", "price", "months"],
};

function readSheet(ws: XLSX.WorkSheet | undefined, name: string | null, columns: readonly Column[], required: string[]): SheetRead {
  const empty: SheetRead = { sheet: name, rows: [], matched: [], ignored: [], missing: [] };
  if (!ws || !ws["!ref"]) return empty;
  const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  // The header is the first row (of the first 10) that names at least two known columns: title rows above it are fine.
  let headerAt = -1;
  let map = new Map<number, string>();
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const candidate = matchHeaders((grid[i] ?? []).map((h) => String(h ?? "")), columns);
    if (candidate.size >= 2) {
      headerAt = i;
      map = candidate;
      break;
    }
  }
  if (headerAt < 0) return { ...empty, missing: required.map((k) => columns.find((c) => c.key === k)!.header) };

  const headers = (grid[headerAt] ?? []).map((h) => String(h ?? "").trim());
  const rows: ImportRow[] = [];
  for (let i = headerAt + 1; i < grid.length; i++) {
    const line = grid[i] ?? [];
    const row: ImportRow = { row: start + i + 1 };
    let any = false;
    for (const [col, key] of map) {
      const kind = columns.find((c) => c.key === key)!.kind;
      const value = convert(line[col], kind);
      row[key] = value;
      if (value !== null) any = true;
    }
    if (any) rows.push(row);
  }
  const keys = new Set(map.values());
  return {
    sheet: name,
    rows,
    matched: columns.filter((c) => keys.has(c.key)).map((c) => c.header),
    ignored: headers.filter((h, i) => h && !map.has(i)),
    missing: required.filter((k) => !keys.has(k)).map((k) => columns.find((c) => c.key === k)!.header),
  };
}

/** Finds the Transactions and Installments sheets (by name, else by their headers) and reads them. CSV works too. */
export function readWorkbook(bytes: ArrayBuffer): { transactions: SheetRead; installments: SheetRead } {
  const wb = XLSX.read(bytes, { type: "array" });
  const byName = (part: string) => wb.SheetNames.find((n) => normalizeHeader(n).includes(part));
  let txName = byName("transaction") ?? null;
  let planName = byName("installment") ?? null;

  if (!txName && !planName) {
    // One unnamed sheet (e.g. a CSV): decide by which columns its headers match better.
    const first = wb.SheetNames[0];
    const ws = first ? wb.Sheets[first] : undefined;
    const top = ws ? (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })[0] ?? []).map((h) => String(h ?? "")) : [];
    const planScore = matchHeaders(top, installmentColumns).size + (top.some((h) => /month|term|principal|rate/i.test(h)) ? 2 : 0);
    if (first && planScore > matchHeaders(top, transactionColumns).size) planName = first;
    else txName = first ?? null;
  }
  return {
    transactions: readSheet(txName ? wb.Sheets[txName] : undefined, txName, transactionColumns, REQUIRED.transactions),
    installments: readSheet(planName ? wb.Sheets[planName] : undefined, planName, installmentColumns, REQUIRED.installments),
  };
}
