/**
 * API routes. Each handler: validate input → call a repository → return JSON.
 * Business rules that span tables (e.g. "category type must match transaction type")
 * live here, where both repositories are in reach.
 */
import {
  colorOwner,
  deleteCategoryQuerySchema,
  budgetInputSchema,
  cashCardSchema,
  idSchema,
  monthlyQuerySchema,
  monthQuerySchema,
  newCategorySchema,
  newTransactionSchema,
  rangeQuerySchema,
  salaryInputSchema,
  transactionQuerySchema,
  updateCategorySchema,
  updateTransactionSchema,
  type TransactionType,
} from "../../shared/contracts";
import { monthlyGross } from "../../shared/salary";
import { HttpError, json, readBody, readQuery, route } from "../http";
import type { ChildrenPlan, Repositories } from "../repositories/types";
import { createCardRoutes, ensureInstallmentsSynced } from "./cards";
import { createImportExportRoutes } from "./importExport";
import { checkSplit, createPeopleRoutes } from "./people";

const formatPeso = (minor: number) => `₱${(minor / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number) => `${n} transaction${n === 1 ? "" : "s"}`;

export function createApiRoutes(repos: Repositories) {
  async function findCategory(rawId: string) {
    const category = await repos.categories.findById(idSchema.parse(rawId));
    if (!category) throw new HttpError(404, "That category doesn't exist anymore.");
    return category;
  }

  const fieldError = (status: number, fields: Record<string, string>) => new HttpError(status, "Some fields need fixing.", fields);

  /** One color per parent, compared by what it looks like (a preset equals its own hex value). Subcategories inherit. */
  async function assertColorFree(color: string, exceptId?: number) {
    const parents = (await repos.categories.list()).filter((c) => c.parentId === null);
    const owner = colorOwner(parents, color, exceptId);
    if (owner) throw fieldError(409, { color: `${owner.name} already uses this color. Pick another.` });
  }

  /** Names are unique within a parent (a DB unique index backs this up; the check gives a friendly message). */
  async function assertNameFree(name: string, type: TransactionType, parentId: number | null, exceptId?: number) {
    const clash = await repos.categories.findByName(name, type, parentId);
    if (clash && clash.id !== exceptId) {
      throw fieldError(409, { name: parentId === null ? `You already have an ${type} category called ${name}.` : `It already has a subcategory called ${name}.` });
    }
  }

  /** A parent must exist and be top level (one level only). Returns it. */
  async function findParent(parentId: number, selfId?: number) {
    const parent = await repos.categories.findById(parentId);
    if (!parent || parent.id === selfId) throw fieldError(400, { parentId: "Choose an existing top-level category." });
    if (parent.parentId !== null) throw fieldError(400, { parentId: `${parent.name} is a subcategory; subcategories can't have their own.` });
    return parent;
  }

  return {
    ...createCardRoutes(repos),
    ...createImportExportRoutes(repos),
    ...createPeopleRoutes(repos),

    "/api/health": {
      GET: route(() => json({ ok: true })),
    },

    "/api/categories": {
      // Flat list; subcategories carry parentId and their parent's color.
      GET: route(async () => json(await repos.categories.list())),

      POST: route(async (req) => {
        const input = await readBody(req, newCategorySchema);
        if (input.parentId !== null) {
          const parent = await findParent(input.parentId);
          if (parent.type !== input.type) throw fieldError(400, { parentId: `${parent.name} is an ${parent.type} category.` });
          await assertNameFree(input.name, input.type, parent.id);
          return json(await repos.categories.create({ name: input.name, type: input.type, color: null, parentId: parent.id }), 201);
        }
        await assertNameFree(input.name, input.type, null);
        await assertColorFree(input.color!);
        return json(await repos.categories.create({ name: input.name, type: input.type, color: input.color!, parentId: null }), 201);
      }),
    },

    "/api/categories/:id": {
      PATCH: route(async (req: Request & { params: { id: string } }) => {
        const current = await findCategory(req.params.id);
        const input = await readBody(req, updateCategorySchema);
        const all = await repos.categories.list();
        const children = all.filter((c) => c.parentId === current.id);
        const parentId = input.parentId === undefined ? current.parentId : input.parentId;

        let type = input.type ?? current.type;
        let color: string | null;
        if (parentId !== null) {
          if (children.length > 0) throw fieldError(409, { parentId: `${current.name} has subcategories, so it stays top level.` });
          const parent = await findParent(parentId, current.id);
          if (input.type !== undefined && input.type !== parent.type) throw fieldError(400, { parentId: `${parent.name} is an ${parent.type} category.` });
          type = parent.type; // a subcategory follows its parent
          color = null; // ...and its color
        } else {
          // Top level needs a color: the one sent, or its own if it already was a parent.
          const own = current.parentId === null ? all.find((c) => c.id === current.id)!.color : undefined;
          color = input.color ?? own ?? null;
          if (color === null) throw fieldError(400, { color: "Pick a color: top-level categories have their own." });
          if (input.color !== undefined || current.parentId !== null) await assertColorFree(color, current.id);
        }
        // A category's type must match its transactions' type, and its subcategories follow it.
        if (type !== current.type && (current.transactionCount > 0 || children.length > 0)) {
          throw fieldError(409, {
            type:
              current.transactionCount > 0
                ? `${current.name} has ${plural(current.transactionCount)}, so it stays an ${current.type} category.`
                : `${current.name} has subcategories, so it stays an ${current.type} category.`,
          });
        }
        await assertNameFree(input.name ?? current.name, type, parentId, current.id);
        return json(await repos.categories.update(current.id, { name: input.name ?? current.name, type, color, parentId }));
      }),

      // In one DB transaction: subcategories are re-parented or (if unused) deleted, then its
      // transactions and installment plans move to `moveTo`, then it's deleted.
      DELETE: route(async (req: Request & { params: { id: string } }) => {
        const current = await findCategory(req.params.id);
        const { moveTo, childrenTo, deleteChildren } = readQuery(req, deleteCategoryQuerySchema);
        const all = await repos.categories.list();
        const children = all.filter((c) => c.parentId === current.id);

        let childrenPlan: ChildrenPlan = null;
        if (children.length > 0) {
          if (childrenTo !== undefined) {
            const target = all.find((c) => c.id === childrenTo);
            if (!target || target.id === current.id || target.parentId !== null || target.type !== current.type) {
              throw fieldError(400, { childrenTo: `Choose another top-level ${current.type} category.` });
            }
            childrenPlan = { moveTo: target.id };
          } else if (deleteChildren) {
            const used = [];
            for (const child of children) {
              if (child.transactionCount > 0 || (await repos.installments.countForCategory(child.id)) > 0) used.push(child.name);
            }
            if (used.length > 0) throw new HttpError(409, `${used.join(", ")} still ${used.length === 1 ? "has" : "have"} transactions. Move the subcategories instead.`);
            childrenPlan = { delete: true };
          } else {
            throw new HttpError(409, `${current.name} has ${children.length} subcategor${children.length === 1 ? "y" : "ies"}. Choose where they go, or delete them if unused.`);
          }
        }

        const plans = await repos.installments.countForCategory(current.id);
        const inUse = current.transactionCount > 0 || plans > 0;
        if (inUse) {
          if (moveTo === undefined) {
            throw new HttpError(
              409,
              plans > 0 && current.transactionCount === 0
                ? `${current.name} is used by ${plans} installment plan${plans === 1 ? "" : "s"}. Choose a category to move them to, then delete.`
                : `${current.name} has ${plural(current.transactionCount)}. Choose a category to move them to, then delete.`,
            );
          }
          const target = all.find((c) => c.id === moveTo);
          const deletedChild = childrenPlan && "delete" in childrenPlan && children.some((c) => c.id === moveTo);
          if (!target || target.id === current.id || target.type !== current.type || deletedChild) {
            throw fieldError(400, { moveTo: `Choose another ${current.type} category.` });
          }
        }
        await repos.categories.remove(current.id, inUse ? moveTo : undefined, childrenPlan);
        return new Response(null, { status: 204 });
      }),
    },

    "/api/transactions": {
      GET: route(async (req) => {
        const query = readQuery(req, transactionQuerySchema);
        await ensureInstallmentsSynced(repos);
        return json(await repos.transactions.list(query));
      }),

      POST: route(async (req) => {
        const input = await readBody(req, newTransactionSchema);
        const category = await repos.categories.findById(input.categoryId);
        if (!category) {
          throw new HttpError(400, "Some fields need fixing.", { categoryId: "Choose a category." });
        }
        if (category.type !== input.type) {
          throw new HttpError(400, "Some fields need fixing.", {
            categoryId: `${category.name} is an ${category.type} category.`,
          });
        }
        if (input.cardId !== null) {
          if (input.type !== "expense") {
            throw new HttpError(400, "Some fields need fixing.", { cardId: "Only expenses can be paid with a card." });
          }
          const card = await repos.cards.findById(input.cardId);
          if (!card || card.archived) {
            throw new HttpError(400, "Some fields need fixing.", { cardId: "Choose one of your active cards, or Cash or debit." });
          }
        }
        const split = await checkSplit(repos, input.split, { amountMinor: input.amountMinor, type: input.type });
        return json(await repos.transactions.create({ ...input, split }), 201);
      }),
    },

    "/api/transactions/:id": {
      PATCH: route(async (req: Request & { params: { id: string } }) => {
        const current = await repos.transactions.findById(idSchema.parse(req.params.id));
        if (!current) throw new HttpError(404, "That transaction doesn't exist anymore.");
        if (current.installmentId !== null) {
          throw new HttpError(409, "This is a billed installment month. Edit the installment plan on its card instead.");
        }
        const input = await readBody(req, updateTransactionSchema);
        if (input.categoryId !== undefined) {
          const category = await repos.categories.findById(input.categoryId);
          if (!category) throw new HttpError(400, "Some fields need fixing.", { categoryId: "Choose a category." });
          if (category.type !== current.type) {
            throw new HttpError(400, "Some fields need fixing.", { categoryId: `${category.name} is an ${category.type} category.` });
          }
        }
        if (input.cardId !== undefined && input.cardId !== null) {
          if (current.type !== "expense") throw new HttpError(400, "Some fields need fixing.", { cardId: "Only expenses can be paid with a card." });
          const card = await repos.cards.findById(input.cardId);
          // An archived card may stay on a charge it already had, but nothing new goes on it.
          if (!card || (card.archived && card.id !== current.card?.id)) {
            throw new HttpError(400, "Some fields need fixing.", { cardId: "Choose one of your active cards, or Cash or debit." });
          }
        }
        // The split is checked against the amount it will have after this change.
        let split = current.split;
        if (input.split !== undefined || (input.amountMinor !== undefined && current.split?.mode === "amounts")) {
          split = await checkSplit(repos, input.split === undefined ? current.split : input.split, {
            amountMinor: input.amountMinor ?? current.amountMinor,
            type: current.type,
            keepIds: current.shares.map((s) => s.personId),
          });
        }
        return json(await repos.transactions.update(current.id, { ...input, ...(input.split !== undefined && { split }) }));
      }),

      DELETE: route(async (req: Request & { params: { id: string } }) => {
        const id = idSchema.parse(req.params.id);
        const result = await repos.transactions.remove(id);
        if (result === "missing") throw new HttpError(404, "That transaction doesn't exist anymore.");
        if (result === "installment") {
          throw new HttpError(409, "This is a billed installment month. Edit, pre-terminate or delete the installment plan on its card instead.");
        }
        return new Response(null, { status: 204 });
      }),
    },

    "/api/summary": {
      GET: route(async (req) => {
        const { month, cardId } = readQuery(req, monthQuerySchema);
        await ensureInstallmentsSynced(repos);
        return json(await repos.summary.forMonth(month, cardId));
      }),
    },

    "/api/summary/range": {
      GET: route(async (req) => {
        const { from, to } = readQuery(req, rangeQuerySchema);
        await ensureInstallmentsSynced(repos);
        return json(await repos.summary.range(from, to));
      }),
    },

    "/api/budgets": {
      GET: route(async () => json(await repos.budgets.list())),
    },

    // Cash & Others cards: a pick of top-level expense categories. Removing one keeps the category.
    "/api/cash-cards": {
      GET: route(async () => json((await repos.budgets.listCards()).map((categoryId) => ({ categoryId })))),
      POST: route(async (req) => {
        const { categoryId } = await readBody(req, cashCardSchema);
        const category = await repos.categories.findById(categoryId);
        if (!category) throw new HttpError(404, "That category doesn't exist anymore.");
        if (category.type !== "expense" || category.parentId !== null) throw fieldError(400, { categoryId: "Cards go on top-level expense categories." });
        await repos.budgets.addCard(category.id);
        return json((await repos.budgets.listCards()).map((id) => ({ categoryId: id })), 201);
      }),
    },

    "/api/cash-cards/:categoryId": {
      DELETE: route(async (req: Request & { params: { categoryId: string } }) => {
        const category = await repos.categories.findById(idSchema.parse(req.params.categoryId));
        if (!category) throw new HttpError(404, "That category doesn't exist anymore.");
        await repos.budgets.removeCard(category.id);
        return json((await repos.budgets.listCards()).map((id) => ({ categoryId: id })));
      }),
    },

    // The main monthly budget for all of Cash & Others (e.g. ₱20,000); null clears it.
    "/api/monthly-budget": {
      GET: route(async () => json({ limitMinor: await repos.budgets.getTotal() })),
      PUT: route(async (req) => {
        const { limitMinor } = await readBody(req, budgetInputSchema);
        await repos.budgets.setTotal(limitMinor);
        return json({ limitMinor: await repos.budgets.getTotal() });
      }),
    },

    "/api/budgets/:categoryId": {
      // Budgets go on top-level expense categories; null clears one.
      PUT: route(async (req: Request & { params: { categoryId: string } }) => {
        const category = await repos.categories.findById(idSchema.parse(req.params.categoryId));
        if (!category) throw new HttpError(404, "That category doesn't exist anymore.");
        if (category.type !== "expense" || category.parentId !== null) throw fieldError(400, { limitMinor: "Budgets go on top-level expense categories." });
        const { limitMinor } = await readBody(req, budgetInputSchema);
        await repos.budgets.set(category.id, limitMinor);
        return json(await repos.budgets.list());
      }),
    },

    "/api/salary": {
      GET: route(async () => json({ profile: (await repos.salary.get()) ?? null })),

      PUT: route(async (req) => {
        const input = await readBody(req, salaryInputSchema);
        const gross = monthlyGross(input.basis, input.grossMinor);
        const deducted = input.deductions.reduce((sum, d) => sum + d.amountMinor, 0);
        if (deducted > gross) {
          throw new HttpError(400, "Some fields need fixing.", {
            deductions: `Deductions (${formatPeso(deducted)} a month) are more than the gross pay (${formatPeso(gross)} a month).`,
          });
        }
        return json({ profile: await repos.salary.save(input) });
      }),
    },

    "/api/summary/monthly": {
      GET: route(async (req) => {
        const { to, months, ...filters } = readQuery(req, monthlyQuerySchema);
        await ensureInstallmentsSynced(repos);
        return json(await repos.summary.monthly(to, months, filters));
      }),
    },
  };
}
