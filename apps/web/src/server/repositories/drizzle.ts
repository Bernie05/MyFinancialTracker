/**
 * Drizzle (SQLite) implementations of the repository interfaces.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Category, Month, Transaction } from "../../shared/contracts";
import type { Db } from "../db/client";
import { installmentSchedule } from "../../shared/installments";
import { cardPayments, categories, creditCards, installments, transactions } from "../db/schema";
import type {
  CardRepository,
  InstallmentRepository,
  CategoryRepository,
  Repositories,
  SummaryRepository,
  TransactionRepository,
} from "./types";

function shiftMonth(month: Month, delta: number): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** [first day of month, first day of next month) — a half-open range that uses the date index. */
function monthRange(month: Month): [string, string] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return [`${month}-01`, `${shiftMonth(month, 1)}-01`];
}

/** The parent row, joined so a subcategory can report its parent's color. */
const parentCategories = alias(categories, "parent_category");
const withParent = eq(categories.parentId, parentCategories.id);

const categoryColumns = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  // A subcategory has no color of its own: it inherits its parent's.
  color: sql<string>`coalesce(${categories.color}, ${parentCategories.color})`,
  parentId: categories.parentId,
};

function createCategoryRepository(db: Db): CategoryRepository {
  /** Categories with their transaction counts: one LEFT JOIN + GROUP BY, no per-row queries. */
  const selectWithCount = () =>
    db
      .select({ ...categoryColumns, transactionCount: sql<number>`count(${transactions.id})` })
      .from(categories)
      .leftJoin(parentCategories, withParent)
      .leftJoin(transactions, eq(transactions.categoryId, categories.id))
      .groupBy(categories.id);

  const findById = async (id: number) => {
    const [row] = await selectWithCount().where(eq(categories.id, id));
    return row;
  };

  return {
    async list() {
      return selectWithCount().orderBy(asc(categories.type), asc(categories.name));
    },
    findById,
    async findByName(name, type, parentId) {
      const [row] = await db
        .select(categoryColumns)
        .from(categories)
        .leftJoin(parentCategories, withParent)
        .where(
          and(
            eq(categories.name, name),
            eq(categories.type, type),
            parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId),
          ),
        )
        .limit(1);
      return row;
    },
    async create(data) {
      const [row] = await db.insert(categories).values(data).returning({ id: categories.id });
      if (!row) throw new Error("insert returned no row");
      return (await findById(row.id))!;
    },
    async update(id, data) {
      await db.update(categories).set(data).where(eq(categories.id, id));
      return (await findById(id))!;
    },
    async remove(id, moveTo, children) {
      db.transaction((tx) => {
        if (children && "moveTo" in children) {
          tx.update(categories).set({ parentId: children.moveTo }).where(eq(categories.parentId, id)).run();
        } else if (children) {
          tx.delete(categories).where(eq(categories.parentId, id)).run(); // the route checked they're unused
        }
        if (moveTo !== undefined) {
          tx.update(transactions).set({ categoryId: moveTo }).where(eq(transactions.categoryId, id)).run();
          tx.update(installments).set({ categoryId: moveTo }).where(eq(installments.categoryId, id)).run();
        }
        tx.delete(categories).where(eq(categories.id, id)).run();
      });
    },
  };
}

function createTransactionRepository(db: Db): TransactionRepository {
  /** One query shape for every read, so list and create return identical objects. */
  const selectWithCategory = () =>
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        description: transactions.description,
        occurredOn: transactions.occurredOn,
        note: transactions.note,
        category: categoryColumns,
        card: { id: creditCards.id, name: creditCards.name, last4: creditCards.last4, color: creditCards.color },
        installmentId: transactions.installmentId,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(parentCategories, withParent)
      .leftJoin(creditCards, eq(transactions.cardId, creditCards.id));

  return {
    async list({ type, from, to, categoryId, cardId, installment, q, page, pageSize }) {
      // Escape LIKE wildcards so a search for "50%" matches the text, not everything.
      const pattern = q && `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const where = and(
        type ? eq(transactions.type, type) : undefined,
        from ? gte(transactions.occurredOn, from) : undefined,
        to ? lte(transactions.occurredOn, to) : undefined,
        // A parent includes its subcategories.
        categoryId
          ? sql`(${transactions.categoryId} = ${categoryId} or ${transactions.categoryId} in (select id from categories where parent_id = ${categoryId}))`
          : undefined,
        cardId ? eq(transactions.cardId, cardId) : undefined,
        installment === "none" ? isNull(transactions.installmentId) : installment === "only" ? sql`${transactions.installmentId} is not null` : undefined,
        pattern
          ? sql`(${transactions.description} like ${pattern} escape '\\' or ${transactions.note} like ${pattern} escape '\\')`
          : undefined,
      );

      const [items, [agg]] = await Promise.all([
        selectWithCategory()
          .where(where)
          .orderBy(desc(transactions.occurredOn), desc(transactions.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({
            total: sql<number>`count(*)`,
            incomeMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} end), 0)`,
            expenseMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} end), 0)`,
          })
          .from(transactions)
          .where(where),
      ]);
      return {
        items: items as Transaction[],
        total: agg?.total ?? 0,
        page,
        pageSize,
        incomeMinor: agg?.incomeMinor ?? 0,
        expenseMinor: agg?.expenseMinor ?? 0,
      };
    },

    async create(data) {
      const [inserted] = await db.insert(transactions).values(data).returning({ id: transactions.id });
      if (!inserted) throw new Error("insert returned no row");
      const [row] = await selectWithCategory().where(eq(transactions.id, inserted.id));
      return row as Transaction;
    },

    async remove(id) {
      const [row] = await db.select({ installmentId: transactions.installmentId }).from(transactions).where(eq(transactions.id, id));
      if (!row) return "missing";
      if (row.installmentId !== null) return "installment";
      await db.delete(transactions).where(eq(transactions.id, id));
      return "removed";
    },
  };
}

function createSummaryRepository(db: Db): SummaryRepository {
  return {
    async forMonth(month, cardId) {
      const [from, to] = monthRange(month);
      const inMonth = and(
        gte(transactions.occurredOn, from),
        lt(transactions.occurredOn, to),
        cardId ? eq(transactions.cardId, cardId) : undefined,
      );

      // The database does the arithmetic: one pass for totals, one GROUP BY for categories.
      const [totals] = await db
        .select({
          incomeMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} end), 0)`,
          expenseMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} end), 0)`,
        })
        .from(transactions)
        .where(inMonth);

      // Per leaf category in SQL, then rolled up to parents here (children keep the breakdown).
      const byLeaf = await db
        .select({ category: categoryColumns, totalMinor: sql<number>`sum(${transactions.amountMinor})` })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(parentCategories, withParent)
        .where(and(inMonth, eq(transactions.type, "expense")))
        .groupBy(categories.id);
      const parentIds = [...new Set(byLeaf.map((r) => r.category.parentId).filter((id): id is number => id !== null))];
      const parents = parentIds.length
        ? await db.select(categoryColumns).from(categories).leftJoin(parentCategories, withParent).where(inArray(categories.id, parentIds))
        : [];
      const roots = new Map<number, { category: Category; totalMinor: number; children: { category: Category; totalMinor: number }[] }>();
      for (const leaf of byLeaf) {
        const rootId = leaf.category.parentId ?? leaf.category.id;
        const rootCategory = leaf.category.parentId === null ? leaf.category : parents.find((p) => p.id === rootId)!;
        const root = roots.get(rootId) ?? { category: rootCategory, totalMinor: 0, children: [] };
        root.totalMinor += leaf.totalMinor;
        root.children.push(leaf);
        roots.set(rootId, root);
      }
      const byCategory = [...roots.values()]
        .map((r) => ({
          ...r,
          // A breakdown only means something when subcategories are involved.
          children: r.children.some((c) => c.category.parentId !== null) ? r.children.sort((a, b) => b.totalMinor - a.totalMinor) : [],
        }))
        .sort((a, b) => b.totalMinor - a.totalMinor);

      const incomeMinor = totals?.incomeMinor ?? 0;
      const expenseMinor = totals?.expenseMinor ?? 0;
      return {
        month,
        incomeMinor,
        expenseMinor,
        netMinor: incomeMinor - expenseMinor,
        expenseByCategory: byCategory,
      };
    },

    async monthly(to, months, cardId) {
      const first = shiftMonth(to, 1 - months);
      const month = sql<string>`substr(${transactions.occurredOn}, 1, 7)`;
      const rows = await db
        .select({
          month,
          incomeMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} end), 0)`,
          expenseMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} end), 0)`,
        })
        .from(transactions)
        .where(
          and(
            gte(transactions.occurredOn, `${first}-01`),
            lt(transactions.occurredOn, `${shiftMonth(to, 1)}-01`),
            cardId ? eq(transactions.cardId, cardId) : undefined,
          ),
        )
        .groupBy(month);
      const byMonth = new Map(rows.map((r) => [r.month, r]));
      // Every month appears, even with no transactions, so the chart's x-axis has no gaps.
      return Array.from({ length: months }, (_, i) => {
        const m = shiftMonth(first, i);
        const r = byMonth.get(m);
        return { month: m, incomeMinor: r?.incomeMinor ?? 0, expenseMinor: r?.expenseMinor ?? 0 };
      });
    },
  };
}

function createCardRepository(db: Db): CardRepository {
  const toCard = ({ createdAt: _c, ...card }: typeof creditCards.$inferSelect) => card;
  const toPayment = ({ createdAt: _c, ...p }: typeof cardPayments.$inferSelect) => p;

  return {
    async list() {
      return (await db.select().from(creditCards).orderBy(asc(creditCards.archived), asc(creditCards.name))).map(toCard);
    },
    async findById(id) {
      const [row] = await db.select().from(creditCards).where(eq(creditCards.id, id));
      return row && toCard(row);
    },
    async findByName(name) {
      const [row] = await db.select().from(creditCards).where(eq(creditCards.name, name));
      return row && toCard(row);
    },
    async create(data) {
      const [row] = await db.insert(creditCards).values(data).returning();
      if (!row) throw new Error("insert returned no row");
      return toCard(row);
    },
    async update(id, data) {
      const [row] = await db.update(creditCards).set(data).where(eq(creditCards.id, id)).returning();
      if (!row) throw new Error("update returned no row");
      return toCard(row);
    },
    async remove(id) {
      await db.delete(creditCards).where(eq(creditCards.id, id));
    },
    // Two aggregate queries per card (charges, payments), with conditional sums for every window at once.
    async totals(id, { statementDate, cycleFrom, today }) {
      const [charges] = await db
        .select({
          toStatement: sql<number>`coalesce(sum(case when ${transactions.occurredOn} <= ${statementDate} then ${transactions.amountMinor} end), 0)`,
          total: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
          cycle: sql<number>`coalesce(sum(case when ${transactions.occurredOn} between ${cycleFrom} and ${today} then ${transactions.amountMinor} end), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(transactions)
        .where(eq(transactions.cardId, id));
      const [paid] = await db
        .select({
          toStatement: sql<number>`coalesce(sum(case when ${cardPayments.paidOn} <= ${statementDate} then ${cardPayments.amountMinor} end), 0)`,
          after: sql<number>`coalesce(sum(case when ${cardPayments.paidOn} > ${statementDate} then ${cardPayments.amountMinor} end), 0)`,
          total: sql<number>`coalesce(sum(${cardPayments.amountMinor}), 0)`,
        })
        .from(cardPayments)
        .where(eq(cardPayments.cardId, id));
      return {
        chargesToStatementMinor: charges?.toStatement ?? 0,
        paymentsToStatementMinor: paid?.toStatement ?? 0,
        paymentsAfterStatementMinor: paid?.after ?? 0,
        chargesTotalMinor: charges?.total ?? 0,
        paymentsTotalMinor: paid?.total ?? 0,
        cycleSpendMinor: charges?.cycle ?? 0,
        transactionCount: charges?.count ?? 0,
      };
    },
    async payments(cardId) {
      const rows = await db
        .select()
        .from(cardPayments)
        .where(eq(cardPayments.cardId, cardId))
        .orderBy(desc(cardPayments.paidOn), desc(cardPayments.id));
      return rows.map(toPayment);
    },
    async addPayment(cardId, data) {
      const [row] = await db.insert(cardPayments).values({ cardId, ...data }).returning();
      if (!row) throw new Error("insert returned no row");
      return toPayment(row);
    },
    async removePayment(cardId, paymentId) {
      const gone = await db
        .delete(cardPayments)
        .where(and(eq(cardPayments.id, paymentId), eq(cardPayments.cardId, cardId)))
        .returning({ id: cardPayments.id });
      return gone.length > 0;
    },
  };
}

function createInstallmentRepository(db: Db): InstallmentRepository {
  const select = () =>
    db
      .select({
        id: installments.id,
        cardId: installments.cardId,
        description: installments.description,
        category: categoryColumns,
        purchasedOn: installments.purchasedOn,
        principalMinor: installments.principalMinor,
        months: installments.months,
        addOnRateBps: installments.addOnRateBps,
        amortizationMinor: installments.amortizationMinor,
        feeMinor: installments.feeMinor,
        firstBillingMonth: installments.firstBillingMonth,
        preterminatedOn: installments.preterminatedOn,
        closingDay: creditCards.closingDay,
      })
      .from(installments)
      .innerJoin(categories, eq(installments.categoryId, categories.id))
      .leftJoin(parentCategories, withParent)
      .innerJoin(creditCards, eq(installments.cardId, creditCards.id));
  const strip = ({ closingDay: _d, ...row }: Awaited<ReturnType<ReturnType<typeof select>["all"]>>[number]) => row;

  /**
   * Billed months become ordinary expense rows (dated on the statement close, on the card, in the plan's
   * category, linked by installment_id + seq). The unique (installment_id, seq) index makes re-runs no-ops.
   */
  function syncNow(today: string, onlyIds?: number[]) {
    const plans = (onlyIds ? select().where(inArray(installments.id, onlyIds)) : select()).all();
    if (plans.length === 0) return;
    const existing = db
      .select({ id: transactions.installmentId, seq: transactions.installmentSeq })
      .from(transactions)
      .where(inArray(transactions.installmentId, plans.map((p) => p.id)))
      .all();
    const have = new Set(existing.map((e) => `${e.id}:${e.seq}`));
    const rows: (typeof transactions.$inferInsert)[] = [];
    for (const plan of plans) {
      const { schedule } = installmentSchedule(plan, plan.closingDay, today);
      for (const entry of schedule) {
        if (entry.status !== "billed" || have.has(`${plan.id}:${entry.seq}`)) continue;
        const label =
          entry.kind === "fee" ? "processing fee" : entry.kind === "pretermination" ? "pre-termination" : `${entry.month}/${plan.months}`;
        rows.push({
          type: "expense",
          amountMinor: entry.amountMinor,
          description: `${plan.description} (${label})`,
          categoryId: plan.category.id,
          occurredOn: entry.billedOn,
          note: null,
          cardId: plan.cardId,
          installmentId: plan.id,
          installmentSeq: entry.seq,
        });
      }
    }
    if (rows.length > 0) db.insert(transactions).values(rows).run();
  }

  return {
    async listForCard(cardId) {
      return (await select().where(eq(installments.cardId, cardId)).orderBy(desc(installments.purchasedOn), desc(installments.id))).map(strip);
    },
    async countForCategory(categoryId) {
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(installments).where(eq(installments.categoryId, categoryId));
      return row?.n ?? 0;
    },
    async findById(id) {
      const [row] = await select().where(eq(installments.id, id));
      return row && strip(row);
    },
    async create(cardId, data) {
      const [row] = await db.insert(installments).values({ cardId, ...data }).returning({ id: installments.id });
      if (!row) throw new Error("insert returned no row");
      return row.id;
    },
    async update(id, data) {
      await db.update(installments).set(data).where(eq(installments.id, id));
    },
    async remove(id) {
      await db.delete(installments).where(eq(installments.id, id));
    },
    async sync(today) {
      syncNow(today);
    },
    async regenerate(ids, today) {
      if (ids.length === 0) return;
      db.transaction(() => {
        db.delete(transactions).where(inArray(transactions.installmentId, ids)).run();
        syncNow(today, ids);
      });
    },
  };
}

export function createDrizzleRepositories(db: Db): Repositories {
  return {
    categories: createCategoryRepository(db),
    transactions: createTransactionRepository(db),
    summary: createSummaryRepository(db),
    cards: createCardRepository(db),
    installments: createInstallmentRepository(db),
  };
}
