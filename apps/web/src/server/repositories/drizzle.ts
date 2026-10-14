/**
 * Drizzle (SQLite) implementations of the repository interfaces.
 */
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Category, Month, Transaction } from "../../shared/contracts";
import type { Db } from "../db/client";
import { categories, transactions } from "../db/schema";
import type {
  CategoryRepository,
  Repositories,
  SummaryRepository,
  TransactionRepository,
} from "./types";

/** [first day of month, first day of next month) — a half-open range that uses the date index. */
function monthRange(month: Month): [string, string] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${month}-01`, `${next}-01`];
}

const categoryColumns = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  color: categories.color,
};

function createCategoryRepository(db: Db): CategoryRepository {
  return {
    async list() {
      return db.select(categoryColumns).from(categories).orderBy(asc(categories.type), asc(categories.name));
    },
    async findById(id) {
      const [row] = await db.select(categoryColumns).from(categories).where(eq(categories.id, id)).limit(1);
      return row;
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
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id));

  return {
    async listByMonth(month) {
      const [from, to] = monthRange(month);
      return selectWithCategory()
        .where(and(gte(transactions.occurredOn, from), lt(transactions.occurredOn, to)))
        .orderBy(desc(transactions.occurredOn), desc(transactions.id));
    },

    async create(data) {
      const [inserted] = await db.insert(transactions).values(data).returning({ id: transactions.id });
      if (!inserted) throw new Error("insert returned no row");
      const [row] = await selectWithCategory().where(eq(transactions.id, inserted.id));
      return row as Transaction;
    },

    async remove(id) {
      const deleted = await db.delete(transactions).where(eq(transactions.id, id)).returning({ id: transactions.id });
      return deleted.length > 0;
    },
  };
}

function createSummaryRepository(db: Db): SummaryRepository {
  return {
    async forMonth(month) {
      const [from, to] = monthRange(month);
      const inMonth = and(gte(transactions.occurredOn, from), lt(transactions.occurredOn, to));

      // The database does the arithmetic: one pass for totals, one GROUP BY for categories.
      const [totals] = await db
        .select({
          incomeMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} end), 0)`,
          expenseMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} end), 0)`,
        })
        .from(transactions)
        .where(inMonth);

      const byCategory = await db
        .select({ category: categoryColumns, totalMinor: sql<number>`sum(${transactions.amountMinor})` })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(inMonth, eq(transactions.type, "expense")))
        .groupBy(categories.id)
        .orderBy(desc(sql`sum(${transactions.amountMinor})`));

      const incomeMinor = totals?.incomeMinor ?? 0;
      const expenseMinor = totals?.expenseMinor ?? 0;
      return {
        month,
        incomeMinor,
        expenseMinor,
        netMinor: incomeMinor - expenseMinor,
        expenseByCategory: byCategory as { category: Category; totalMinor: number }[],
      };
    },
  };
}

export function createDrizzleRepositories(db: Db): Repositories {
  return {
    categories: createCategoryRepository(db),
    transactions: createTransactionRepository(db),
    summary: createSummaryRepository(db),
  };
}
