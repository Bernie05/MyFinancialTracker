/**
 * Online credit loans (SPayLater, SLoan, Home Credit…) are installment plans on an online credit account.
 * People know a loan by its first due date; the plan works in statement months. These helpers translate.
 */
import { closeInMonth, dueDateFor } from "./cardCycle";

/** Common Philippine online lenders and pay-later services, to pick from when adding a loan. */
export const loanProviders = ["SPayLater", "SLoan", "Lazada PayLater", "Home Credit", "GGives", "GLoan", "Atome", "BillEase", "Maya Credit"] as const;

const shift = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

/**
 * Statement and due days for a new account, from a loan's first due date: payments are due on that day of
 * the month, and the statement closes 10 days before (on the 18th–28th of the previous month for an early due day).
 */
export function accountDaysFor(firstDue: string) {
  const dueDay = Number(firstDue.slice(8, 10));
  return { dueDay, closingDay: dueDay > 10 ? dueDay - 10 : dueDay + 18 };
}

/**
 * The statement month whose due date falls in `firstDue`'s month, never before the month the loan was
 * taken (`borrowedOn`): a first payment due too soon moves to the next cycle.
 */
export function billingMonthFor(firstDue: string, borrowedOn: string, account: { closingDay: number; dueDay: number }) {
  const dueMonth = firstDue.slice(0, 7);
  const month = account.closingDay < account.dueDay ? dueMonth : shift(dueMonth, -1);
  return month < borrowedOn.slice(0, 7) ? borrowedOn.slice(0, 7) : month;
}

/** When the first payment of a plan billed from `billingMonth` is actually due. */
export const firstDueDate = (billingMonth: string, account: { closingDay: number; dueDay: number }) =>
  dueDateFor(closeInMonth(billingMonth, account.closingDay), account.dueDay);
