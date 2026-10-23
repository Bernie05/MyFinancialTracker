import { expect, test } from "bun:test";
import { defaultFirstBillingMonth, installmentSchedule, type InstallmentTerms } from "./installments";

const base: InstallmentTerms = {
  principalMinor: 1_000_000,
  months: 3,
  addOnRateBps: 0,
  amortizationMinor: null,
  feeMinor: 0,
  firstBillingMonth: "2026-08",
  preterminatedOn: null,
};

test("0%: months add up exactly, the last absorbs rounding", () => {
  const s = installmentSchedule(base, 6, "2026-08-01");
  expect(s.schedule.map((e) => e.amountMinor)).toEqual([333_333, 333_333, 333_334]);
  expect(s.totalMinor).toBe(1_000_000);
  expect(s.interestMinor).toBe(0);
  expect(s.schedule.map((e) => e.billedOn)).toEqual(["2026-08-06", "2026-09-06", "2026-10-06"]);
});

test("add-on interest: principal x rate x months", () => {
  const s = installmentSchedule({ ...base, principalMinor: 3_200_000, months: 6, addOnRateBps: 79 }, 20, "2026-01-01");
  expect(s.interestMinor).toBe(151_680);
  expect(s.totalMinor).toBe(3_351_680);
  expect(s.monthlyMinor).toBe(558_613);
  expect(s.schedule.at(-1)!.amountMinor).toBe(3_351_680 - 558_613 * 5);
  expect(s.schedule.reduce((sum, e) => sum + e.principalMinor, 0)).toBe(3_200_000);
});

test("the bank's amortization figure wins", () => {
  const s = installmentSchedule({ ...base, principalMinor: 3_200_000, months: 6, addOnRateBps: 79, amortizationMinor: 558_614 }, 20, "2026-01-01");
  expect(s.schedule.every((e) => e.amountMinor === 558_614)).toBe(true);
  expect(s.totalMinor).toBe(558_614 * 6);
  expect(s.interestMinor).toBe(558_614 * 6 - 3_200_000);
});

test("first billing month: the statement on or after the purchase", () => {
  expect(defaultFirstBillingMonth("2026-07-10", 6)).toBe("2026-08"); // after the Jul 6 close
  expect(defaultFirstBillingMonth("2026-07-06", 6)).toBe("2026-07"); // on the closing day: that statement
  expect(defaultFirstBillingMonth("2026-01-31", 31)).toBe("2026-01");
  expect(defaultFirstBillingMonth("2026-02-01", 31)).toBe("2026-02"); // closes Feb 28
});

test("billed vs upcoming, remaining and unbilled principal, completion", () => {
  const mid = installmentSchedule({ ...base, months: 12, principalMinor: 8_399_000 }, 6, "2026-10-23");
  expect(mid.monthsBilled).toBe(3); // Aug, Sep, Oct 6
  expect(mid.status).toBe("active");
  expect(mid.unbilledPrincipalMinor).toBe(mid.remainingMinor); // 0%: they match
  expect(mid.schedule[2]!.remainingAfterMinor).toBe(mid.remainingMinor);

  const done = installmentSchedule(base, 6, "2026-10-06");
  expect(done.status).toBe("completed");
  expect(done.remainingMinor).toBe(0);
});

test("fee is billed with month 1", () => {
  const s = installmentSchedule({ ...base, feeMinor: 50_000 }, 6, "2026-08-06");
  expect(s.schedule[0]).toMatchObject({ kind: "fee", amountMinor: 50_000, billedOn: "2026-08-06", status: "billed" });
  expect(s.totalMinor).toBe(1_050_000);
});

test("pre-termination bills the remaining principal in that cycle and completes the plan", () => {
  const terms = { ...base, months: 6, principalMinor: 600_000, addOnRateBps: 100, preterminatedOn: "2026-09-10" };
  const s = installmentSchedule(terms, 6, "2026-10-23");
  // Aug 6 and Sep 6 bill normally; Sep 10 falls in the cycle closing Oct 6.
  expect(s.schedule.map((e) => [e.kind, e.billedOn])).toEqual([
    ["amortization", "2026-08-06"],
    ["amortization", "2026-09-06"],
    ["pretermination", "2026-10-06"],
  ]);
  expect(s.schedule[2]!.amountMinor).toBe(400_000); // principal only, no further add-on interest
  expect(s.status).toBe("completed");
  expect(s.remainingMinor).toBe(0);
});
