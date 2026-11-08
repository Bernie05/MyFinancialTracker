import { expect, test } from "bun:test";
import { allocate, myShare, normalizeSplit } from "./split";

const sum = (a: { amountMinor: number }[]) => a.reduce((s, x) => s + x.amountMinor, 0);

test("null split is all yours", () => {
  expect(allocate(1000, null)).toEqual([{ personId: null, amountMinor: 1000 }]);
});

test("equal split hands out the odd centavo so parts add up", () => {
  const a = allocate(1001, { mode: "equal", parts: [{ personId: null, value: 0 }, { personId: 7, value: 0 }] });
  expect(a).toEqual([{ personId: null, amountMinor: 501 }, { personId: 7, amountMinor: 500 }]);
  const three = allocate(10000, { mode: "equal", parts: [{ personId: null, value: 1 }, { personId: 1, value: 1 }, { personId: 2, value: 1 }] });
  expect(three.map((x) => x.amountMinor)).toEqual([3334, 3333, 3333]);
  expect(sum(three)).toBe(10000);
});

test("shares are weights", () => {
  const a = allocate(90000, { mode: "shares", parts: [{ personId: null, value: 2 }, { personId: 3, value: 1 }] });
  expect(a.map((x) => x.amountMinor)).toEqual([60000, 30000]);
});

test("amounts are exact when they add up, and proportional on another amount", () => {
  const split = { mode: "amounts" as const, parts: [{ personId: null, value: 30000 }, { personId: 4, value: 70000 }] };
  expect(allocate(100000, split).map((x) => x.amountMinor)).toEqual([30000, 70000]);
  // An installment's monthly bill of 8,333.34 splits 30/70 too.
  const monthly = allocate(833334, split);
  expect(sum(monthly)).toBe(833334);
  expect(monthly[0]!.amountMinor).toBe(250000);
  expect(myShare(100000, split)).toBe(30000);
});

test("normalize: you alone → null, one person → equal of one", () => {
  expect(normalizeSplit({ mode: "shares", parts: [{ personId: null, value: 3 }] })).toBeNull();
  expect(normalizeSplit({ mode: "amounts", parts: [{ personId: 9, value: 500 }] })).toEqual({ mode: "equal", parts: [{ personId: 9, value: 1 }] });
});
