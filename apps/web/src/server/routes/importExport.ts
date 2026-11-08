/**
 * Excel export and import (the workbook itself is built and read in the browser; see shared/importExport.ts).
 *
 * Import is two calls with the same body: `commit: false` checks every row and returns a preview
 * (adds, updates, unchanged, new categories, errors); `commit: true` does the same checks and, only
 * when there are no errors, applies everything in one DB transaction.
 *
 * Mapping: categories and cards are matched by name (case and spacing don't matter). An unknown
 * category or subcategory is created; an unknown card is an error. A row with an ID updates that
 * transaction or plan; a blank ID adds a new one. Nothing is ever deleted by an import.
 */
import { categoryColorPresets, colorOwner, newInstallmentSchema, newTransactionSchema, type Card, type TransactionType } from "../../shared/contracts";
import { defaultFirstBillingMonth } from "../../shared/installments";
import {
  cellNumber,
  cellText,
  cellToMinor,
  importRequestSchema,
  INSTALLMENTS_SHEET,
  TRANSACTIONS_SHEET,
  type ImportReport,
  type ImportRequest,
  type ImportRow,
} from "../../shared/importExport";
import { json, MAX_IMPORT_BODY, readBody, route } from "../http";
import type { Split } from "../../shared/split";
import type { CategoryRef, ImportPlan, PlanSplit, Repositories } from "../repositories/types";
import { todayLocal } from "./cards";

const lower = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const CASH = new Set(["", "cash", "debit", "cash or debit", "cash/debit", "none", "-"]);

const transactionLabels: Record<string, string> = {
  amountMinor: "Amount",
  description: "Description",
  occurredOn: "Date",
  note: "Note",
  cardId: "Paid with",
  type: "Type",
};
const installmentLabels: Record<string, string> = {
  description: "Description",
  purchasedOn: "Purchase date",
  principalMinor: "Price",
  months: "Months",
  addOnRateBps: "Add-on rate",
  amortizationMinor: "Bank's monthly amount",
  feeMinor: "Processing fee",
  firstBillingMonth: "First billed",
  preterminatedOn: "Pre-terminated on",
};

const isBlankRow = (r: ImportRow) => Object.entries(r).every(([k, v]) => k === "row" || cellText(v) === "");

async function planImport(repos: Repositories, input: ImportRequest) {
  const categories = await repos.categories.list();
  const cards = await repos.cards.list();
  const existingTx = new Map((await repos.transactions.listEntered()).map((t) => [t.id, t]));
  const existingPlans = new Map((await repos.installments.listAll()).map((p) => [p.id, p]));

  const errors: ImportReport["errors"] = [];
  const plan: ImportPlan = { newCategories: [], newPeople: [], addTransactions: [], updateTransactions: [], addInstallments: [], updateInstallments: [] };
  const allPeople = await repos.people.list();
  const counts = { transactions: { added: 0, updated: 0, unchanged: 0 }, installments: { added: 0, updated: 0, unchanged: 0 } };
  const newCategories: ImportReport["newCategories"] = [];

  // Categories ---------------------------------------------------------------
  const parents = categories.filter((c) => c.parentId === null);
  const colorsInUse: { id: number; color: string }[] = [...parents];
  const planned = new Set<string>();

  /** First preset no top-level category uses, else a random unused color. */
  function freeColor() {
    const preset = categoryColorPresets.find((key) => !colorOwner(colorsInUse, key));
    let color: string = preset ?? "";
    while (!color || colorOwner(colorsInUse, color)) color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
    colorsInUse.push({ id: -colorsInUse.length - 1, color });
    return color;
  }

  function resolveCategory(type: TransactionType, parentName: string, childName: string): { ref: CategoryRef } | { error: string } {
    if (!parentName) return { error: "Category: add one." };
    if (parentName.length > 40 || childName.length > 40) return { error: "Category: keep names under 40 characters." };
    const parent = parents.find((c) => c.type === type && lower(c.name) === lower(parentName));
    let parentRef: CategoryRef;
    if (parent) parentRef = parent.id;
    else {
      // "Phones" in the Category column, with no subcategory: use the subcategory of that name if there's exactly one.
      if (!childName) {
        const subs = categories.filter((c) => c.parentId !== null && c.type === type && lower(c.name) === lower(parentName));
        if (subs.length === 1) return { ref: subs[0]!.id };
      }
      parentRef = `${type}|${lower(parentName)}`;
      if (!planned.has(parentRef)) {
        planned.add(parentRef);
        plan.newCategories.push({ key: parentRef, name: parentName, type, color: freeColor(), parent: null });
        newCategories.push({ path: parentName, type });
      }
    }
    if (!childName) return { ref: parentRef };
    const child = typeof parentRef === "number" ? categories.find((c) => c.parentId === parentRef && lower(c.name) === lower(childName)) : undefined;
    if (child) return { ref: child.id };
    const key = `${type}|${lower(parentName)}|${lower(childName)}`;
    if (!planned.has(key)) {
      planned.add(key);
      plan.newCategories.push({ key, name: childName, type, color: null, parent: parentRef });
      newCategories.push({ path: `${parent?.name ?? parentName} › ${childName}`, type });
    }
    return { ref: key };
  }

  // People and the "For" column -----------------------------------------------
  const plannedPeople = new Map<string, string>(); // key → name as first written

  function resolvePerson(name: string): { person: number | string | null } | { error: string } {
    if (["me", "you", "myself", "self"].includes(lower(name))) return { person: null };
    if (name.length > 40) return { error: "For: keep names under 40 characters." };
    const found = allPeople.find((p) => lower(p.name) === lower(name));
    if (found) return found.archived ? { error: `For: ${found.name} is archived. Unarchive them on the People page first.` } : { person: found.id };
    const key = `person|${lower(name)}`;
    if (!plannedPeople.has(key)) {
      plannedPeople.set(key, name);
      plan.newPeople.push({ key, name });
    }
    return { person: key };
  }

  /**
   * "For" text → a split. Blank = all yours. "Ana" = all Ana's. "Me, Ana" = equal. "Me:2, Ana:1" = shares.
   * "Me=500, Ana=700" = exact amounts, which must add up to `amountMinor`.
   */
  function parseFor(text: string, amountMinor: number | null): { split: PlanSplit | null } | { error: string } {
    const items = text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return { split: null };
    const parsed = items.map((item) => {
      const m = /^(.*?)\s*(?:([:=])\s*(.*))?$/.exec(item)!;
      return { name: m[1]!.trim(), op: m[2] ?? "", value: (m[3] ?? "").trim() };
    });
    const ops = new Set(parsed.map((p) => p.op));
    if (ops.size > 1) return { error: 'For: use one style for everyone, e.g. "Me, Ana" or "Me:2, Ana:1" or "Me=500, Ana=700".' };
    const mode = parsed[0]!.op === ":" ? "shares" : parsed[0]!.op === "=" ? "amounts" : "equal";
    const parts: PlanSplit["parts"] = [];
    const seen = new Set<number | string | null>();
    for (const p of parsed) {
      if (!p.name) return { error: `For: a name is missing in "${text}".` };
      const who = resolvePerson(p.name);
      if ("error" in who) return who;
      if (seen.has(who.person)) return { error: `For: ${p.name} is listed twice.` };
      seen.add(who.person);
      let value = 1;
      if (mode === "shares") {
        value = Number(p.value);
        if (!Number.isInteger(value) || value < 1 || value > 1000) return { error: `For: shares are whole numbers from 1 to 1000 (got "${p.value}" for ${p.name}).` };
      } else if (mode === "amounts") {
        const minor = cellToMinor(p.value);
        if (minor === null || Number.isNaN(minor) || minor < 1) return { error: `For: use an amount like 500.00 for ${p.name} (got "${p.value}").` };
        value = minor;
      }
      parts.push({ person: who.person, value });
    }
    if (mode === "amounts" && amountMinor !== null && !Number.isNaN(amountMinor)) {
      const sum = parts.reduce((a, p) => a + p.value, 0);
      if (sum !== amountMinor) return { error: `For: the amounts add up to ${(sum / 100).toFixed(2)}, but the total is ${(amountMinor / 100).toFixed(2)}.` };
    }
    if (parts.length === 1) return { split: parts[0]!.person === null ? null : { mode: "equal", parts: [{ person: parts[0]!.person, value: 1 }] } };
    return { split: { mode, parts } };
  }

  /** A stored split in the plan's shape, to compare with what the sheet says. */
  const asPlanSplit = (split: Split | null): PlanSplit | null => split && { mode: split.mode, parts: split.parts.map((p) => ({ person: p.personId, value: p.value })) };
  const sameSplit = (a: PlanSplit | null, b: PlanSplit | null) => JSON.stringify(a) === JSON.stringify(b);

  /** The For cell → split. Column missing: keep an existing item's split, or start a new one with the card's usual person. */
  function splitFromRow(r: ImportRow, amountMinor: number | null, card: Card | null, existing: Split | null | undefined, type: TransactionType) {
    if (r.for === undefined) {
      if (existing !== undefined) return { split: asPlanSplit(existing), changed: false as const };
      const usual = card?.defaultPersonId;
      return { split: usual && type === "expense" ? { mode: "equal" as const, parts: [{ person: usual, value: 1 }] } : null, changed: false as const };
    }
    const result = parseFor(cellText(r.for), amountMinor);
    if ("error" in result) return result;
    if (result.split && type !== "expense") return { error: "For: only expenses can be split or assigned to someone." };
    return { split: result.split, changed: true as const };
  }

  // Cards --------------------------------------------------------------------
  function resolveCard(text: string): { card: Card | null } | { error: string } {
    if (CASH.has(lower(text))) return { card: null };
    const digits = text.replace(/\D/g, "");
    const card =
      cards.find((c) => lower(c.name) === lower(text)) ??
      (digits.length === 4 ? cards.find((c) => c.last4 === digits) : undefined) ??
      cards.find((c) => c.last4 && lower(`${c.name} ${c.last4}`) === lower(text.replace(/[•*·]/g, " ")));
    if (card) return { card };
    const names = cards.filter((c) => !c.archived).map((c) => c.name);
    return { error: `No card called "${text}".${names.length ? ` Use ${names.join(", ")}` : ""}${names.length ? ", or" : ""} leave it blank for cash or debit.` };
  }

  // Transactions -------------------------------------------------------------
  const seenTx = new Set<number>();
  for (const r of input.transactions) {
    if (isBlankRow(r)) continue;
    const problems: string[] = [];
    const fail = () => errors.push({ sheet: TRANSACTIONS_SHEET, row: r.row, message: problems.join(" ") });

    const idText = cellText(r.id);
    const existing = idText ? existingTx.get(Number(idText)) : undefined;
    if (idText && !existing) {
      problems.push(`ID ${idText} isn't one of your transactions. Clear the ID to add this row as new.`);
      fail();
      continue;
    }
    if (existing) {
      if (seenTx.has(existing.id)) problems.push(`ID ${existing.id} appears more than once.`);
      seenTx.add(existing.id);
    }

    const typeText = lower(cellText(r.type));
    const type: TransactionType | null =
      typeText === "" ? (existing?.type ?? "expense") : typeText.startsWith("inc") ? "income" : typeText.startsWith("exp") ? "expense" : null;
    if (!type) {
      problems.push(`Type: use Expense or Income (got "${cellText(r.type)}").`);
      fail();
      continue;
    }
    if (existing && type !== existing.type) problems.push("Type: an existing transaction can't switch between income and expense. Delete it in the app and add it again.");

    const amountMinor = cellToMinor(r.amount);
    if (amountMinor === null) problems.push("Amount: add one.");
    else if (Number.isNaN(amountMinor)) problems.push(`Amount: use a number like 1,250.50 (got "${cellText(r.amount)}").`);

    const cardResult = resolveCard(cellText(r.card));
    const card = "card" in cardResult ? cardResult.card : null;
    if ("error" in cardResult) problems.push(`Paid with: ${cardResult.error}`);
    else if (card && type === "income") problems.push("Paid with: only expenses can be paid with a card.");
    else if (card?.archived && existing?.card?.id !== card.id) problems.push(`Paid with: ${card.name} is archived.`);

    const category = resolveCategory(type, cellText(r.category), cellText(r.subcategory));
    if ("error" in category) problems.push(category.error);
    const forResult = splitFromRow(r, amountMinor, card, existing ? existing.split : undefined, type);
    if ("error" in forResult) problems.push(forResult.error);

    const data = {
      type,
      amountMinor: amountMinor ?? 0,
      description: cellText(r.description),
      categoryId: 1, // checked separately above
      occurredOn: cellText(r.date),
      note: cellText(r.note) || null,
      cardId: card?.id ?? null,
    };
    const parsed = newTransactionSchema.safeParse(data);
    for (const issue of parsed.error?.issues ?? []) {
      const field = String(issue.path[0]);
      if (field === "amountMinor" && (amountMinor === null || Number.isNaN(amountMinor))) continue;
      problems.push(`${transactionLabels[field] ?? field}: ${issue.message}`);
    }
    if (problems.length > 0 || !parsed.success || "error" in category || "error" in forResult) {
      fail();
      continue;
    }

    const { categoryId: _c, split: _s, ...t } = parsed.data;
    if (!existing) {
      plan.addTransactions.push({ ...t, split: forResult.split, category: category.ref });
      counts.transactions.added++;
      continue;
    }
    const change: ImportPlan["updateTransactions"][number] = { id: existing.id };
    if (t.amountMinor !== existing.amountMinor) change.amountMinor = t.amountMinor;
    if (t.description !== existing.description) change.description = t.description;
    if (t.occurredOn !== existing.occurredOn) change.occurredOn = t.occurredOn;
    if (t.note !== existing.note) change.note = t.note;
    if (t.cardId !== (existing.card?.id ?? null)) change.cardId = t.cardId;
    if (category.ref !== existing.category.id) change.category = category.ref;
    if (forResult.changed && !sameSplit(forResult.split, asPlanSplit(existing.split))) change.split = forResult.split;
    if (Object.keys(change).length === 1) counts.transactions.unchanged++;
    else {
      plan.updateTransactions.push(change);
      counts.transactions.updated++;
    }
  }

  // Installments -------------------------------------------------------------
  const seenPlans = new Set<number>();
  for (const r of input.installments) {
    if (isBlankRow(r)) continue;
    const problems: string[] = [];
    const fail = () => errors.push({ sheet: INSTALLMENTS_SHEET, row: r.row, message: problems.join(" ") });

    const idText = cellText(r.id);
    const existing = idText ? existingPlans.get(Number(idText)) : undefined;
    if (idText && !existing) {
      problems.push(`ID ${idText} isn't one of your installment plans. Clear the ID to add this row as new.`);
      fail();
      continue;
    }
    if (existing) {
      if (seenPlans.has(existing.id)) problems.push(`ID ${existing.id} appears more than once.`);
      seenPlans.add(existing.id);
    }

    const cardText = cellText(r.card);
    const cardResult = cardText ? resolveCard(cardText) : { error: "add the card the plan is on." };
    const card = "card" in cardResult ? cardResult.card : null;
    if ("error" in cardResult) problems.push(`Card: ${cardResult.error}`);
    else if (!card) problems.push("Card: an installment plan needs a credit card.");
    else if (existing && existing.cardId !== card.id) problems.push("Card: a plan can't move to another card. Delete it in the app and add it again.");
    else if (!existing && card.archived) problems.push(`Card: ${card.name} is archived. Unarchive it to add installments.`);

    const category = resolveCategory("expense", cellText(r.category), cellText(r.subcategory));
    if ("error" in category) problems.push(category.error);

    const principalMinor = cellToMinor(r.price);
    if (principalMinor === null) problems.push("Price: add one.");
    else if (Number.isNaN(principalMinor)) problems.push(`Price: use a number like 83,990.00 (got "${cellText(r.price)}").`);
    const months = cellNumber(r.months);
    if (months === null) problems.push("Months: add the term, e.g. 12.");
    // A blank rate takes the card's configured rate for that term, else 0.
    const configuredBps = card && months !== null ? card.installmentRates.find((x) => x.months === months)?.addOnRateBps : undefined;
    const rate = cellNumber(r.rate) ?? (configuredBps ?? 0) / 100;
    if (Number.isNaN(rate)) problems.push(`Add-on rate: use a number like 0.79, or 0 (got "${cellText(r.rate)}").`);
    const amortizationMinor = cellToMinor(r.monthly);
    if (Number.isNaN(amortizationMinor)) problems.push(`Bank's monthly amount: use a number like 7,000.00 (got "${cellText(r.monthly)}").`);
    const feeMinor = cellToMinor(r.fee) ?? 0;
    if (Number.isNaN(feeMinor)) problems.push(`Processing fee: use a number like 500.00 (got "${cellText(r.fee)}").`);

    const purchasedOn = cellText(r.purchasedOn);
    const firstText = cellText(r.firstBilled);
    const firstBillingMonth =
      (firstText.length >= 7 ? firstText.slice(0, 7) : firstText) ||
      existing?.firstBillingMonth ||
      (card && /^\d{4}-\d{2}-\d{2}$/.test(purchasedOn) ? defaultFirstBillingMonth(purchasedOn, card.closingDay) : undefined);

    const parsed = newInstallmentSchema.safeParse({
      description: cellText(r.description),
      categoryId: 1, // checked separately above
      purchasedOn,
      principalMinor: principalMinor ?? 0,
      months: months ?? 0,
      addOnRateBps: Math.round(rate * 100),
      amortizationMinor,
      feeMinor,
      firstBillingMonth,
      preterminatedOn: cellText(r.preterminatedOn) || null,
    });
    const forResult = splitFromRow(r, principalMinor, card, existing ? existing.split : undefined, "expense");
    if ("error" in forResult) problems.push(forResult.error);
    const reported = new Set(problems.map((p) => p.split(":")[0]));
    for (const issue of parsed.error?.issues ?? []) {
      const label = installmentLabels[String(issue.path[0])] ?? String(issue.path[0]);
      if (!reported.has(label)) problems.push(`${label}: ${issue.message}`);
      reported.add(label);
    }
    if (problems.length > 0 || !parsed.success || "error" in category || !card || "error" in forResult) {
      fail();
      continue;
    }

    const { categoryId: _c, firstBillingMonth: first, split: _s, ...terms } = parsed.data;
    const p = { ...terms, firstBillingMonth: first! };
    if (!existing) {
      plan.addInstallments.push({ ...p, split: forResult.split, cardId: card.id, category: category.ref });
      counts.installments.added++;
      continue;
    }
    const change: ImportPlan["updateInstallments"][number] = { id: existing.id };
    for (const key of Object.keys(p) as (keyof typeof p)[]) {
      if (p[key] !== existing[key]) (change as Record<string, unknown>)[key] = p[key];
    }
    if (category.ref !== existing.category.id) change.category = category.ref;
    if (forResult.changed && !sameSplit(forResult.split, asPlanSplit(existing.split))) change.split = forResult.split;
    if (Object.keys(change).length === 1) counts.installments.unchanged++;
    else {
      plan.updateInstallments.push(change);
      counts.installments.updated++;
    }
  }

  // Errors are already in sheet then row order.
  const report: ImportReport = { committed: false, ...counts, newCategories, newPeople: plan.newPeople.map((p) => p.name), errors };
  return { plan, report };
}

export function createImportExportRoutes(repos: Repositories) {
  return {
    "/api/export": {
      GET: route(async () =>
        json({
          transactions: await repos.transactions.listEntered(),
          installments: await repos.installments.listAll(),
          categories: await repos.categories.list(),
          cards: await repos.cards.list(),
          people: (await repos.people.list()).map(({ id, name, archived }) => ({ id, name, archived })),
        }),
      ),
    },

    "/api/import": {
      POST: route(async (req) => {
        const input = await readBody(req, importRequestSchema, MAX_IMPORT_BODY);
        const { plan, report } = await planImport(repos, input);
        if (input.commit && report.errors.length === 0) {
          const { installmentIds } = await repos.imports.apply(plan);
          // Billed months of new or changed plans are rebuilt from their terms.
          if (installmentIds.length > 0) await repos.installments.regenerate(installmentIds, todayLocal());
          report.committed = true;
        }
        return json(report);
      }),
    },
  };
}
