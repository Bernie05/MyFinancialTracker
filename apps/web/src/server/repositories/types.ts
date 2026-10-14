/**
 * Repository interfaces — what the routes depend on.
 *
 * Routes never import Drizzle or the schema. They receive these interfaces, so moving
 * from SQLite to Neon (or faking the data in a test) means writing a new implementation,
 * not touching a route.
 */
import type { Category, Month, MonthSummary, Transaction } from "../../shared/contracts";
import type { TransactionType } from "../db/schema";

export interface CreateTransactionData {
  type: TransactionType;
  amountMinor: number;
  description: string;
  categoryId: number;
  occurredOn: string;
  note: string | null;
}

export interface CategoryRepository {
  list(): Promise<Category[]>;
  findById(id: number): Promise<Category | undefined>;
}

export interface TransactionRepository {
  /** Transactions dated within `month`, newest first. */
  listByMonth(month: Month): Promise<Transaction[]>;
  create(data: CreateTransactionData): Promise<Transaction>;
  /** Returns false when nothing had that id. */
  remove(id: number): Promise<boolean>;
}

export interface SummaryRepository {
  forMonth(month: Month): Promise<MonthSummary>;
}

export interface Repositories {
  categories: CategoryRepository;
  transactions: TransactionRepository;
  summary: SummaryRepository;
}
