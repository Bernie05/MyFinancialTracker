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
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
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
    case "today":
      return { from: localDate(now), to: localDate(now) };
    case "week": {
      // Monday to Sunday.
      const monday = now.getDate() - ((now.getDay() + 6) % 7);
      return { from: localDate(new Date(y, m, monday)), to: localDate(new Date(y, m, monday + 6)) };
    }
    case "month":
      return { from: localDate(new Date(y, m, 1)), to: localDate(new Date(y, m + 1, 0)) };
    case "lastmonth":
      return { from: localDate(new Date(y, m - 1, 1)), to: localDate(new Date(y, m, 0)) };
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

/** "Today", "Yesterday", "Mon, Oct 20" (with the year when it isn't this year). */
export function dayLabel(isoDate: string, locale = "en-PH"): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", ...(y !== today.getFullYear() && { year: "numeric" }) });
}

/** "Oct 1, 2026 – Oct 31, 2026", "From Oct 1, 2026", "All time". */
export function rangeLabel(from?: string, to?: string, locale = "en-PH"): string {
  const fmt = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number) as [number, number, number];
    return new Date(yy, mm - 1, dd).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  };
  if (from && from === to) return fmt(from);
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return "All time";
}

// Stepping: ‹ › moves a whole calendar month, a Mon–Sun week or a single day. --------------------

export type StepUnit = "month" | "week" | "day";

/** Which unit a preset steps by; the rolling and open presets (30 days, 3 months, year, all, custom) don't step. */
export const stepUnit = (preset: RangePreset): StepUnit | null =>
  preset === "month" || preset === "lastmonth" ? "month" : preset === "week" ? "week" : preset === "today" ? "day" : null;

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** The first day of the period that contains `date` (YYYY-MM-DD): the 1st, the Monday, or the day itself. */
export function periodStart(unit: StepUnit, date: string): string {
  const d = parse(date);
  if (unit === "month") return localDate(new Date(d.getFullYear(), d.getMonth(), 1));
  if (unit === "week") return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
  return date;
}

/** `start` moved by `delta` periods (calendar maths in local dates, so month lengths and years roll over). */
export function shiftPeriod(unit: StepUnit, start: string, delta: number): string {
  const d = parse(start);
  if (unit === "month") return localDate(new Date(d.getFullYear(), d.getMonth() + delta, 1));
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta * (unit === "week" ? 7 : 1)));
}

/** Inclusive bounds of the period starting at `start`. */
export function periodRange(unit: StepUnit, start: string): { from: string; to: string } {
  const d = parse(start);
  if (unit === "month") return { from: start, to: localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  return { from: start, to: unit === "week" ? shiftPeriod("day", start, 6) : start };
}

/** "October 2026", "Oct 13 – 19", "Thu, Oct 23"; the year is added when it isn't the current one. */
export function periodLabel(unit: StepUnit, start: string, locale = "en-PH"): string {
  if (unit === "month") return monthLabel(start.slice(0, 7), locale);
  const { from, to } = periodRange(unit, start);
  const thisYear = String(new Date().getFullYear());
  const year = from.startsWith(thisYear) && to.startsWith(thisYear) ? {} : { year: "numeric" as const };
  if (unit === "day") return parse(start).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", ...year });
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", ...year }).formatRange(parse(from), parse(to));
}
