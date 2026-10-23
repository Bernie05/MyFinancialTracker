/**
 * Credit card installment plans (PH bank style: 0% or a monthly add-on rate). Pure functions.
 *
 * Rules (also in the README)
 * - Month i is billed on the card's statement that closes in billing month i (first billing month + i - 1),
 *   dated on that closing date, so it lands in that statement, its due date and its reminders.
 * - Add-on interest: principal x monthly rate x months, spread evenly. Each month is total / months,
 *   rounded to the centavo; the last month absorbs the rounding so the months add up exactly.
 * - A bank amortization override wins: every month is that figure, and total = override x months.
 * - A one-time processing fee is billed with month 1.
 * - Pre-termination: months closing before the pre-termination cycle bill as usual; the remaining
 *   principal is billed in the cycle containing the pre-termination date (no further add-on interest).
 * - Available credit drops by the unbilled principal; expenses are recognised as each month is billed.
 */
import { closeInMonth, nextClose } from "./cardCycle";

export interface InstallmentTerms {
  principalMinor: number;
  months: number;
  /** Monthly add-on rate in basis points: 0.79% a month = 79. */
  addOnRateBps: number;
  /** The bank's monthly figure, if it differs from the computed one. */
  amortizationMinor: number | null;
  feeMinor: number;
  /** `YYYY-MM`: the month whose statement bills month 1. */
  firstBillingMonth: string;
  preterminatedOn: string | null;
}

export type ScheduleKind = "amortization" | "fee" | "pretermination";

export interface ScheduleEntry {
  /** Stable id within the plan: 0 = fee, 1..n = months, n + 1 = pre-termination. */
  seq: number;
  kind: ScheduleKind;
  /** 1-based month number for amortizations, else null. */
  month: number | null;
  /** The statement closing date it is billed on. */
  billedOn: string;
  amountMinor: number;
  principalMinor: number;
  status: "billed" | "upcoming";
  /** Total still to be billed after this entry. */
  remainingAfterMinor: number;
}

/** The first statement closing on or after the purchase date bills month 1. */
export const defaultFirstBillingMonth = (purchasedOn: string, closingDay: number) =>
  nextClose(purchasedOn, closingDay).slice(0, 7);

export function installmentSchedule(terms: InstallmentTerms, closingDay: number, today: string) {
  const { principalMinor: P, months: n, addOnRateBps, amortizationMinor, feeMinor, firstBillingMonth, preterminatedOn } = terms;

  const total = amortizationMinor !== null ? amortizationMinor * n : P + Math.round((P * addOnRateBps * n) / 10_000);
  const regular = amortizationMinor ?? Math.round(total / n);
  const principalRegular = Math.round(P / n);

  let entries: Omit<ScheduleEntry, "status" | "remainingAfterMinor">[] = [];
  for (let i = 1; i <= n; i++) {
    const last = i === n;
    entries.push({
      seq: i,
      kind: "amortization",
      month: i,
      billedOn: closeInMonth(firstBillingMonth, closingDay, i - 1),
      amountMinor: last ? total - regular * (n - 1) : regular,
      principalMinor: last ? P - principalRegular * (n - 1) : principalRegular,
    });
  }

  if (preterminatedOn) {
    const cutoff = nextClose(preterminatedOn, closingDay);
    entries = entries.filter((e) => e.billedOn < cutoff);
    const remainingPrincipal = P - entries.reduce((sum, e) => sum + e.principalMinor, 0);
    if (remainingPrincipal > 0) {
      entries.push({ seq: n + 1, kind: "pretermination", month: null, billedOn: cutoff, amountMinor: remainingPrincipal, principalMinor: remainingPrincipal });
    }
  }
  if (feeMinor > 0 && entries[0]) {
    entries.unshift({ seq: 0, kind: "fee", month: null, billedOn: entries[0].billedOn, amountMinor: feeMinor, principalMinor: 0 });
  }

  const grandTotal = entries.reduce((sum, e) => sum + e.amountMinor, 0);
  let billedSoFar = 0;
  const schedule: ScheduleEntry[] = entries.map((e) => {
    billedSoFar += e.amountMinor;
    return { ...e, status: e.billedOn <= today ? "billed" : "upcoming", remainingAfterMinor: grandTotal - billedSoFar };
  });

  const upcoming = schedule.filter((e) => e.status === "upcoming");
  return {
    schedule,
    monthlyMinor: regular,
    totalMinor: grandTotal,
    interestMinor: total - P,
    monthsBilled: schedule.filter((e) => e.kind === "amortization" && e.status === "billed").length,
    remainingMinor: upcoming.reduce((sum, e) => sum + e.amountMinor, 0),
    unbilledPrincipalMinor: upcoming.reduce((sum, e) => sum + e.principalMinor, 0),
    firstBilledOn: schedule[0]?.billedOn ?? closeInMonth(firstBillingMonth, closingDay),
    endsOn: schedule.at(-1)?.billedOn ?? closeInMonth(firstBillingMonth, closingDay),
    status: upcoming.length === 0 ? ("completed" as const) : ("active" as const),
  };
}
