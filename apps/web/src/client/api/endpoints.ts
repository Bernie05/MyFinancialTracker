import { z } from "zod";
import {
  categorySchema,
  monthSummarySchema,
  transactionSchema,
  type Month,
  type NewTransaction,
} from "../../shared/contracts";
import { request } from "./client";

export const api = {
  listCategories: () => request("/api/categories", z.array(categorySchema)),

  listTransactions: (month: Month) =>
    request(`/api/transactions?month=${encodeURIComponent(month)}`, z.array(transactionSchema)),

  createTransaction: (input: NewTransaction) =>
    request("/api/transactions", transactionSchema, { method: "POST", body: JSON.stringify(input) }),

  deleteTransaction: (id: number) => request(`/api/transactions/${id}`, null, { method: "DELETE" }),

  getSummary: (month: Month) => request(`/api/summary?month=${encodeURIComponent(month)}`, monthSummarySchema),
};
