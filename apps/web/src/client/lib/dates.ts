import type { Month } from "../../shared/contracts";

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as a local calendar date, YYYY-MM-DD (not UTC: in Manila at 7am, UTC is still yesterday). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const currentMonth = (): Month => todayLocal().slice(0, 7);

export function shiftMonth(month: Month, delta: number): Month {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function monthLabel(month: Month, locale = "en-PH"): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** "2026-10-12" → "Oct 12", read as a local date so it never shifts a day. */
export function shortDate(isoDate: string, locale = "en-PH"): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
