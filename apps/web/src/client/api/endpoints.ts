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
import { request } from "./client";

export const api = {
  // Accounts
  me: () => request("/api/auth/me", z.object({ user: userSchema })),
  /** Always the same 202 message, whether or not the email was new (no session; sign in next). */
  register: (input: Credentials) => request("/api/auth/register", z.object({ message: z.string() }), { method: "POST", body: JSON.stringify(input) }),
  login: (input: Credentials) => request("/api/auth/login", z.object({ user: userSchema }), { method: "POST", body: JSON.stringify(input) }),
  logout: () => request("/api/auth/logout", null, { method: "POST", body: "{}" }),
  changePassword: (input: ChangePassword) => request("/api/auth/password", null, { method: "POST", body: JSON.stringify(input) }),

  listCategories: () => request("/api/categories", z.array(categoryListItemSchema)),

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

  getMonthly: (to: Month, months = 6, cardId?: number) =>
    request(
      `/api/summary/monthly?to=${encodeURIComponent(to)}&months=${months}${cardId ? `&cardId=${cardId}` : ""}`,
      z.array(monthTotalsSchema),
    ),

  // Credit cards
  listCards: () => request("/api/cards", z.array(cardSummarySchema)),
  getCard: (id: number) => request(`/api/cards/${id}`, cardSummarySchema),
  createCard: (input: NewCard) => request("/api/cards", cardSummarySchema, { method: "POST", body: JSON.stringify(input) }),
  updateCard: (id: number, input: UpdateCard) =>
    request(`/api/cards/${id}`, cardSummarySchema, { method: "PATCH", body: JSON.stringify(input) }),
  deleteCard: (id: number) => request(`/api/cards/${id}`, null, { method: "DELETE" }),
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
