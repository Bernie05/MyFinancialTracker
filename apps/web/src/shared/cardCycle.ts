/**
 * Credit card statement-cycle math. Pure functions on `YYYY-MM-DD` strings (calendar dates, no time zone).
 *
 * Rules
 * - A statement closes at the end of the closing day each month. A closing or due day past the end
 *   of a short month falls on that month's last day (day 31 → Feb 28, Apr 30).
 * - The current cycle runs from the day after the last close up to the next close (today included).
 *   On the closing day itself, that day's cycle is still open.
 * - A statement's due date is the first due day strictly after its closing date.
 * - Statement balance = all charges up to the close − all payments up to the close (never below 0),
 *   so an unpaid older statement carries into the next one. Payments after the close count toward it.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** `day` of month (y, m), clamped to the month's length. m is 1-12 and may overflow either way. */
function clampDate(y: number, m: number, day: number) {
  const d = new Date(Date.UTC(y, m - 1, 1));
  const yy = d.getUTCFullYear();
  const mm = d.getUTCMonth() + 1;
  return toIso(yy, mm, Math.min(day, daysInMonth(yy, mm)));
}

/** The statement closing date in calendar month `YYYY-MM` (+ `offset` months). */
export function closeInMonth(month: string, closingDay: number, offset = 0) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return clampDate(y, m + offset, closingDay);
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** The most recent closing date strictly before `today` (the last closed statement). */
export function lastClose(today: string, closingDay: number) {
  const [y, m] = parts(today);
  const thisMonth = clampDate(y, m, closingDay);
  return thisMonth < today ? thisMonth : clampDate(y, m - 1, closingDay);
}

/** The closing date that ends the cycle containing `today`. */
export const nextClose = (today: string, closingDay: number) => {
  const [y, m] = parts(today);
  const thisMonth = clampDate(y, m, closingDay);
  return thisMonth >= today ? thisMonth : clampDate(y, m + 1, closingDay);
};

/** Due date for the statement that closed on `close`: the first due day strictly after it. */
export function dueDateFor(close: string, dueDay: number) {
  const [y, m] = parts(close);
  const sameMonth = clampDate(y, m, dueDay);
  return sameMonth > close ? sameMonth : clampDate(y, m + 1, dueDay);
}

/** Every closing date from the first one after `from` up to and including `to`, oldest first. */
export function closesBetween(from: string, to: string, closingDay: number) {
  const out: string[] = [];
  let [y, m] = parts(from);
  for (let i = 0; i < 600; i++, m++) {
    const c = clampDate(y, m, closingDay);
    if (c > to) break;
    if (c > from) out.push(c);
  }
  return out;
}

export type CardStatus = "upcoming" | "due_soon" | "overdue" | "paid";

export interface CycleInput {
  today: string;
  closingDay: number;
  dueDay: number;
  notifyDays: number;
  limitMinor: number;
  /** Totals the caller sums from the database for the dates below. */
  chargesToStatementMinor: number;
  paymentsToStatementMinor: number;
  paymentsAfterStatementMinor: number;
  chargesTotalMinor: number;
  paymentsTotalMinor: number;
  cycleSpendMinor: number;
  /** Installment principal not billed yet: banks hold it against the limit. */
  unbilledInstallmentPrincipalMinor?: number;
}

/** The dates the caller needs sums for, given today. */
export function cycleDates(today: string, closingDay: number) {
  const statementDate = lastClose(today, closingDay);
  return { statementDate, cycleFrom: addDays(statementDate, 1), cycleTo: nextClose(today, closingDay) };
}

export function cardStatus(input: CycleInput) {
  const { today, closingDay, dueDay, notifyDays, limitMinor } = input;
  const { statementDate, cycleFrom, cycleTo } = cycleDates(today, closingDay);
  const statementMinor = Math.max(0, input.chargesToStatementMinor - input.paymentsToStatementMinor);
  const paidSinceStatementMinor = input.paymentsAfterStatementMinor;
  const remainingDueMinor = Math.max(0, statementMinor - paidSinceStatementMinor);
  // Negative when overpaid: the card holds a credit.
  const outstandingMinor = input.chargesTotalMinor - input.paymentsTotalMinor;

  const statementDue = dueDateFor(statementDate, dueDay);
  // Once this statement is settled, the date that matters is the next statement's due date.
  const dueDate = remainingDueMinor > 0 ? statementDue : dueDateFor(cycleTo, dueDay);
  const daysUntilDue = daysBetween(today, dueDate);
  const status: CardStatus =
    remainingDueMinor === 0 ? "paid" : daysUntilDue < 0 ? "overdue" : daysUntilDue <= notifyDays ? "due_soon" : "upcoming";

  return {
    outstandingMinor,
    availableMinor: limitMinor - Math.max(0, outstandingMinor) - (input.unbilledInstallmentPrincipalMinor ?? 0),
    utilisationPct:
      limitMinor > 0
        ? Math.round(((Math.max(0, outstandingMinor) + (input.unbilledInstallmentPrincipalMinor ?? 0)) / limitMinor) * 100)
        : 0,
    cycleFrom,
    cycleTo,
    cycleSpendMinor: input.cycleSpendMinor,
    statementDate,
    statementMinor,
    paidSinceStatementMinor,
    remainingDueMinor,
    dueDate,
    daysUntilDue,
    status,
  };
}
