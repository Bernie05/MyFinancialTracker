import { expect, test } from "bun:test";
import { cardStatus, closesBetween, dueDateFor, lastClose, nextClose } from "./cardCycle";

const base = {
  closingDay: 6,
  dueDay: 27,
  notifyDays: 5,
  limitMinor: 10_000_000,
  chargesToStatementMinor: 0,
  paymentsToStatementMinor: 0,
  paymentsAfterStatementMinor: 0,
  chargesTotalMinor: 0,
  paymentsTotalMinor: 0,
  cycleSpendMinor: 0,
};

test("closing and due days clamp to short months", () => {
  expect(lastClose("2026-03-05", 31)).toBe("2026-02-28");
  expect(nextClose("2026-02-10", 31)).toBe("2026-02-28");
  expect(dueDateFor("2026-08-20", 31)).toBe("2026-08-31");
  expect(dueDateFor("2026-09-20", 31)).toBe("2026-09-30");
  expect(dueDateFor("2026-10-15", 5)).toBe("2026-11-05");
  expect(dueDateFor("2026-12-15", 5)).toBe("2027-01-05");
});

test("the closing day itself is still in the open cycle", () => {
  expect(lastClose("2026-10-06", 6)).toBe("2026-09-06");
  expect(lastClose("2026-10-07", 6)).toBe("2026-10-06");
  expect(nextClose("2026-10-06", 6)).toBe("2026-10-06");
});

test("closesBetween lists every close in the range", () => {
  expect(closesBetween("2026-07-01", "2026-10-23", 31)).toEqual(["2026-07-31", "2026-08-31", "2026-09-30"]);
});

test("status: due soon, overdue, paid, overpaid, empty", () => {
  const due = { ...base, today: "2026-10-23", chargesToStatementMinor: 1_240_000, chargesTotalMinor: 1_500_000 };
  const s = cardStatus(due);
  expect(s.statementDate).toBe("2026-10-06");
  expect(s.dueDate).toBe("2026-10-27");
  expect(s.daysUntilDue).toBe(4);
  expect(s.status).toBe("due_soon");
  expect(s.remainingDueMinor).toBe(1_240_000);
  expect(s.cycleFrom).toBe("2026-10-07");

  expect(cardStatus({ ...due, today: "2026-10-29" }).status).toBe("overdue");
  expect(cardStatus({ ...due, today: "2026-10-10" }).status).toBe("upcoming");

  const paid = cardStatus({ ...due, paymentsAfterStatementMinor: 1_240_000, paymentsTotalMinor: 1_240_000 });
  expect(paid.status).toBe("paid");
  expect(paid.dueDate).toBe("2026-11-27"); // next statement's due date

  const over = cardStatus({ ...due, paymentsAfterStatementMinor: 2_000_000, paymentsTotalMinor: 2_000_000 });
  expect(over.remainingDueMinor).toBe(0);
  expect(over.outstandingMinor).toBe(-500_000); // a credit
  expect(over.availableMinor).toBe(10_000_000);
  expect(over.utilisationPct).toBe(0);

  const empty = cardStatus({ ...base, today: "2026-10-23" });
  expect(empty.status).toBe("paid");
  expect(empty.outstandingMinor).toBe(0);
});

test("an unpaid older statement carries into the next one", () => {
  // 5,000 charged before the Sep close, nothing paid; 1,000 more before the Oct close.
  const s = cardStatus({ ...base, today: "2026-10-23", chargesToStatementMinor: 600_000, chargesTotalMinor: 600_000 });
  expect(s.statementMinor).toBe(600_000);
});
