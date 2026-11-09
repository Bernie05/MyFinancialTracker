import { expect, test } from "bun:test";
import { accountDaysFor, billingMonthFor, firstDueDate } from "./loans";

test("a new account's days come from the first due date", () => {
  expect(accountDaysFor("2026-12-25")).toEqual({ dueDay: 25, closingDay: 15 });
  expect(accountDaysFor("2026-12-05")).toEqual({ dueDay: 5, closingDay: 23 });
});

test("the first payment lands on the due date the person chose", () => {
  for (const due of ["2026-12-25", "2026-12-05", "2027-01-10", "2027-03-31"]) {
    const account = accountDaysFor(due);
    const month = billingMonthFor(due, "2026-11-09", account);
    expect(firstDueDate(month, account)).toBe(due);
  }
});

test("an existing account keeps its own due day; only the month is taken", () => {
  const account = { closingDay: 15, dueDay: 25 };
  expect(firstDueDate(billingMonthFor("2027-01-03", "2026-11-09", account), account)).toBe("2027-01-25");
});

test("a first due date too soon after borrowing moves to the next cycle", () => {
  const account = { closingDay: 23, dueDay: 5 }; // statement on the 23rd, due the 5th of the next month
  // Borrowed Nov 9, first due Nov 5 (before the loan): billing can't start before November.
  expect(billingMonthFor("2026-11-05", "2026-11-09", account)).toBe("2026-11");
  expect(firstDueDate("2026-11", account)).toBe("2026-12-05");
});
