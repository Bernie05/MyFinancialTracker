import { z } from "zod";
import {
  cardAlertSchema,
  cardPaymentSchema,
  cardSummarySchema,
  categoryListItemSchema,
  userSchema,
  type ChangePassword,
  type Credentials,
  installmentDetailSchema,
  monthSummarySchema,
  monthTotalsSchema,
  rangeSummarySchema,
  salaryResponseSchema,
  type SalaryInput,
  type MonthlyFilters,
  personDetailSchema,
  personPaymentSchema,
  personSummarySchema,
  type NewPerson,
  type NewPersonPayment,
  type UpdatePerson,
  transactionPageSchema,
  transactionSchema,
  type Month,
  type NewCard,
  type NewCardPayment,
  type NewInstallment,
  type NewCategory,
  type NewTransaction,
  type TransactionFilters,
  type UpdateCard,
  type UpdateCategory,
  type UpdateInstallment,
  type UpdateTransaction,
} from "../../shared/contracts";
import { exportDataSchema, importReportSchema, type ImportRequest } from "../../shared/importExport";
import { request } from "./client";

export const api = {
  // Excel export / import (the workbook is built and read in the browser: lib/excel.ts)
  exportData: () => request("/api/export", exportDataSchema),
  /** `commit: false` previews; `commit: true` applies, only when the preview has no errors. */
  importData: (input: ImportRequest) => request("/api/import", importReportSchema, { method: "POST", body: JSON.stringify(input) }),

  // Accounts
  me: () => request("/api/auth/me", z.object({ user: userSchema })),
  /** Always the same 202 message, whether or not the email was new (no session; sign in next). */
  register: (input: Credentials) => request("/api/auth/register", z.object({ message: z.string() }), { method: "POST", body: JSON.stringify(input) }),
  login: (input: Credentials) => request("/api/auth/login", z.object({ user: userSchema }), { method: "POST", body: JSON.stringify(input) }),
  logout: () => request("/api/auth/logout", null, { method: "POST", body: "{}" }),
  changePassword: (input: ChangePassword) => request("/api/auth/password", null, { method: "POST", body: JSON.stringify(input) }),

  listCategories: () => request("/api/categories", z.array(categoryListItemSchema)),

  // People (friends whose charges go on your cards) and what they owe
  listPeople: () => request("/api/people", z.array(personSummarySchema)),
  getPerson: (id: number) => request(`/api/people/${id}`, personDetailSchema),
  createPerson: (input: NewPerson) => request("/api/people", personSummarySchema, { method: "POST", body: JSON.stringify(input) }),
  updatePerson: (id: number, input: UpdatePerson) => request(`/api/people/${id}`, personSummarySchema, { method: "PATCH", body: JSON.stringify(input) }),
  deletePerson: (id: number) => request(`/api/people/${id}`, null, { method: "DELETE" }),
  addPersonPayment: (id: number, input: NewPersonPayment) =>
    request(`/api/people/${id}/payments`, personPaymentSchema, { method: "POST", body: JSON.stringify(input) }),
  deletePersonPayment: (id: number, paymentId: number) => request(`/api/people/${id}/payments/${paymentId}`, null, { method: "DELETE" }),

  createCategory: (input: NewCategory) =>
    request("/api/categories", categoryListItemSchema, { method: "POST", body: JSON.stringify(input) }),

  updateCategory: (id: number, input: UpdateCategory) =>
    request(`/api/categories/${id}`, categoryListItemSchema, { method: "PATCH", body: JSON.stringify(input) }),

  /**
   * `moveTo`: needed when it still has transactions. For a parent with subcategories: `childrenTo`
   * (another parent) or `deleteChildren` (only if they are unused). The API answers 409 otherwise.
   */
  deleteCategory: (id: number, opts: { moveTo?: number; childrenTo?: number; deleteChildren?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.moveTo) q.set("moveTo", String(opts.moveTo));
    if (opts.childrenTo) q.set("childrenTo", String(opts.childrenTo));
    if (opts.deleteChildren) q.set("deleteChildren", "1");
    return request(`/api/categories/${id}${q.size ? `?${q}` : ""}`, null, { method: "DELETE" });
  },

  /** Filtered, paginated transactions. Unset filters are left out of the query. */
  listTransactions: (filters: TransactionFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
    return request(`/api/transactions?${params}`, transactionPageSchema, { signal });
  },

  createTransaction: (input: NewTransaction) =>
    request("/api/transactions", transactionSchema, { method: "POST", body: JSON.stringify(input) }),

  /** Not for billed installment months (409): those are managed by their plan. */
  updateTransaction: (id: number, input: UpdateTransaction) =>
    request(`/api/transactions/${id}`, transactionSchema, { method: "PATCH", body: JSON.stringify(input) }),

  deleteTransaction: (id: number) => request(`/api/transactions/${id}`, null, { method: "DELETE" }),

  /** With `cardId`, only that card's charges. */
  getSummary: (month: Month, cardId?: number) =>
    request(`/api/summary?month=${encodeURIComponent(month)}${cardId ? `&cardId=${cardId}` : ""}`, monthSummarySchema),

  /** A number is a card id (the card page); an object narrows by card, category tree or how it was paid. */
  getMonthly: (to: Month, months = 6, filters?: number | MonthlyFilters) => {
    const f: MonthlyFilters = typeof filters === "number" ? { cardId: filters } : (filters ?? {});
    const params = new URLSearchParams({ to, months: String(months) });
    for (const [key, value] of Object.entries(f)) if (value !== undefined) params.set(key, String(value));
    return request(`/api/summary/monthly?${params}`, z.array(monthTotalsSchema));
  },

  /** Whole months `from`…`to`, both included: a quarter, a year. */
  getRangeSummary: (from: Month, to: Month) =>
    request(`/api/summary/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, rangeSummarySchema),

  // My salary
  getSalary: () => request("/api/salary", salaryResponseSchema),
  saveSalary: (input: SalaryInput) => request("/api/salary", salaryResponseSchema, { method: "PUT", body: JSON.stringify(input) }),

  // Credit cards
  listCards: () => request("/api/cards", z.array(cardSummarySchema)),
  getCard: (id: number) => request(`/api/cards/${id}`, cardSummarySchema),
  createCard: (input: NewCard) => request("/api/cards", cardSummarySchema, { method: "POST", body: JSON.stringify(input) }),
  updateCard: (id: number, input: UpdateCard) =>
    request(`/api/cards/${id}`, cardSummarySchema, { method: "PATCH", body: JSON.stringify(input) }),
  /** `withHistory` also deletes its charges, loans and payments; without it, a card with charges is refused. */
  deleteCard: (id: number, { withHistory = false } = {}) =>
    request(`/api/cards/${id}${withHistory ? "?history=delete" : ""}`, null, { method: "DELETE" }),
  listPayments: (cardId: number) => request(`/api/cards/${cardId}/payments`, z.array(cardPaymentSchema)),
  addPayment: (cardId: number, input: NewCardPayment) =>
    request(`/api/cards/${cardId}/payments`, cardPaymentSchema, { method: "POST", body: JSON.stringify(input) }),
  deletePayment: (cardId: number, paymentId: number) =>
    request(`/api/cards/${cardId}/payments/${paymentId}`, null, { method: "DELETE" }),
  getAlerts: () => request("/api/alerts", z.array(cardAlertSchema)),

  // Installments
  /** Each plan with its full schedule (for the grouped Payments view). */
  listInstallments: (cardId: number) => request(`/api/cards/${cardId}/installments`, z.array(installmentDetailSchema)),
  getInstallment: (id: number) => request(`/api/installments/${id}`, installmentDetailSchema),
  createInstallment: (cardId: number, input: NewInstallment) =>
    request(`/api/cards/${cardId}/installments`, installmentDetailSchema, { method: "POST", body: JSON.stringify(input) }),
  updateInstallment: (id: number, input: UpdateInstallment) =>
    request(`/api/installments/${id}`, installmentDetailSchema, { method: "PATCH", body: JSON.stringify(input) }),
  deleteInstallment: (id: number) => request(`/api/installments/${id}`, null, { method: "DELETE" }),
};
