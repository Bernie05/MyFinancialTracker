import { expect, test } from "bun:test";
import { billingsFor } from "./routes/people";

// Two items on cash (no card): an older straight charge and a 2-month plan.
const inputs = [
  { key: "t1", monthKey: "t1", occurredOn: "2026-01-05", description: "Accessories", totalMinor: 1000, amountMinor: 1000, installmentId: null, upcoming: false, cardId: null },
  { key: "t2", monthKey: "p9-1", occurredOn: "2026-02-05", description: "Burger (1/2)", totalMinor: 500, amountMinor: 500, installmentId: 9, upcoming: false, cardId: null },
  { key: "p9-2", monthKey: "p9-2", occurredOn: "2026-03-05", description: "Burger (2/2)", totalMinor: 500, amountMinor: 500, installmentId: 9, upcoming: true, cardId: null },
];
const items = (payments: { amountMinor: number; itemKey: string | null }[]) =>
  Object.fromEntries(billingsFor(inputs, new Map(), payments, "2026-02-10").flatMap((b) => b.items.map((i) => [i.key, i.paidMinor])));

test("a repayment for an item settles that item, not the oldest charge", () => {
  expect(items([{ amountMinor: 1000, itemKey: "p9" }])).toEqual({ t1: 0, t2: 500, "p9-2": 500 });
});

test("untargeted repayments still settle the oldest first", () => {
  expect(items([{ amountMinor: 1200, itemKey: null }])).toEqual({ t1: 1000, t2: 200, "p9-2": 0 });
});

test("more than an item needs, or an item that's gone, goes to the oldest", () => {
  expect(items([{ amountMinor: 1300, itemKey: "p9" }])).toEqual({ t1: 300, t2: 500, "p9-2": 500 });
  expect(items([{ amountMinor: 400, itemKey: "p77" }])).toEqual({ t1: 400, t2: 0, "p9-2": 0 });
});

test("a repayment for one month covers that month, even a later one", () => {
  expect(items([{ amountMinor: 500, itemKey: "p9-2" }])).toEqual({ t1: 0, t2: 0, "p9-2": 500 });
  // More than the month needs goes to the rest of the plan.
  expect(items([{ amountMinor: 700, itemKey: "p9-2" }])).toEqual({ t1: 0, t2: 200, "p9-2": 500 });
});
