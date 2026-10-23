import { expect, test } from "bun:test";
import { periodLabel, periodRange, periodStart, shiftPeriod } from "./dates";

test("months step whole calendar months, rolling the year", () => {
  expect(periodStart("month", "2026-10-23")).toBe("2026-10-01");
  expect(periodRange("month", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  expect(periodRange("month", "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(periodRange("month", "2026-02-01").to).toBe("2026-02-28"); // short month
  expect(periodRange("month", "2028-02-01").to).toBe("2028-02-29"); // leap year
  expect(shiftPeriod("month", "2026-10-01", -1)).toBe("2026-09-01");
  expect(shiftPeriod("month", "2026-01-01", -1)).toBe("2025-12-01"); // Jan -> Dec
  expect(shiftPeriod("month", "2026-12-01", 1)).toBe("2027-01-01"); // Dec -> Jan
  expect(shiftPeriod("month", "2026-03-01", -13)).toBe("2025-02-01");
});

test("weeks run Monday to Sunday, across months and years", () => {
  expect(periodStart("week", "2026-10-23")).toBe("2026-10-19"); // Friday -> Monday
  expect(periodStart("week", "2026-10-19")).toBe("2026-10-19"); // Monday itself
  expect(periodStart("week", "2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before it
  expect(periodRange("week", "2026-09-28")).toEqual({ from: "2026-09-28", to: "2026-10-04" }); // across months
  expect(periodStart("week", "2027-01-01")).toBe("2026-12-28"); // across years
  expect(periodRange("week", "2026-12-28")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  expect(shiftPeriod("week", "2026-12-28", 1)).toBe("2027-01-04");
  expect(shiftPeriod("week", "2026-10-05", -1)).toBe("2026-09-28");
});

test("days step one at a time", () => {
  expect(shiftPeriod("day", "2026-03-01", -1)).toBe("2026-02-28");
  expect(shiftPeriod("day", "2026-12-31", 1)).toBe("2027-01-01");
  expect(periodRange("day", "2026-10-22")).toEqual({ from: "2026-10-22", to: "2026-10-22" });
});

test("labels read naturally", () => {
  expect(periodLabel("month", "2026-10-01")).toBe("October 2026");
  expect(periodLabel("week", "2026-10-12")).toMatch(/^Oct 12\s*–\s*18/);
  expect(periodLabel("week", "2026-09-28")).toMatch(/^Sep 28\s*–\s*Oct 4/);
  expect(periodLabel("day", "2025-10-22")).toContain("2025"); // another year shows it
});
