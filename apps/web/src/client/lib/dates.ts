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

/** "2026-10" → "Oct", for chart axes. */
export function shortMonth(month: Month, locale = "en-PH"): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short" });
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const rangePresets = [
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;
export type RangePreset = (typeof rangePresets)[number]["value"];

/** Inclusive date bounds for a preset, relative to today; undefined means open-ended. */
export function presetRange(preset: Exclude<RangePreset, "custom">): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: localDate(new Date(y, m, 1)), to: localDate(new Date(y, m + 1, 0)) };
    case "30d":
      return { from: localDate(new Date(y, m, now.getDate() - 29)), to: localDate(now) };
    case "3m":
      return { from: localDate(new Date(y, m - 2, 1)), to: localDate(now) };
    case "year":
      return { from: `${y}-01-01`, to: localDate(now) };
    case "all":
      return {};
  }
}

/** "Oct 1, 2026 – Oct 31, 2026", "From Oct 1, 2026", "All time". */
export function rangeLabel(from?: string, to?: string, locale = "en-PH"): string {
  const fmt = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number) as [number, number, number];
    return new Date(yy, mm - 1, dd).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return "All time";
}
