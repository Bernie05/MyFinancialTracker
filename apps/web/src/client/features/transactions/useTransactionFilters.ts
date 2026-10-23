import type { TransactionType } from "../../../shared/contracts";
import { periodLabel, periodRange, periodStart, presetRange, rangePresets, shiftPeriod, stepUnit, todayLocal, type RangePreset } from "../../lib/dates";
import { navigate, useSearch } from "../../lib/router";

export const PAGE_SIZES = [10, 20, 50, 100] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/**
 * The list's filters and page live in the URL query string, so a reload or a shared link
 * keeps them and Back/Forward step through them. Anything malformed falls back to the default.
 */
export function useTransactionFilters(type: TransactionType) {
  const params = new URLSearchParams(useSearch());
  const get = (key: string) => params.get(key) ?? undefined;

  const rangeParam = get("range");
  const range: RangePreset = rangePresets.some((p) => p.value === rangeParam) ? (rangeParam as RangePreset) : "month";
  // A stepped period: ?range=month&at=2026-09, ?range=week&at=2026-10-13 (its Monday), ?range=today&at=2026-10-22.
  // No "at" means the current one, so the plain preset URLs keep working.
  const unit = stepUnit(range);
  const today = todayLocal();
  const current = unit && periodStart(unit, range === "lastmonth" ? shiftPeriod("month", today, -1) : today);
  const at = get("at") ?? "";
  const stepped = unit === "month" ? (MONTH.test(at) ? `${at}-01` : undefined) : unit && DATE.test(at) ? periodStart(unit, at) : undefined;
  const start = stepped ?? current;
  const { from, to } =
    range === "custom"
      ? { from: DATE.test(get("from") ?? "") ? get("from") : undefined, to: DATE.test(get("to") ?? "") ? get("to") : undefined }
      : unit && start
        ? periodRange(unit, start)
        : presetRange(range);
  const categoryId = Number(get("categoryId")) > 0 ? Number(get("categoryId")) : undefined;
  // Set by a card page's "View all charges" link: only that card's expenses.
  const cardId = Number(get("cardId")) > 0 ? Number(get("cardId")) : undefined;
  const q = get("q")?.trim() || undefined;
  const page = Math.max(1, Math.floor(Number(get("page"))) || 1);
  const pageSizeParam = Number(get("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeParam) ? pageSizeParam : 20;

  /**
   * Changes some params. Any change except the page itself sends the user back to page 1.
   * `replace` updates the URL without a new history entry (for search typing).
   */
  function update(changes: Record<string, string | number | undefined>, { replace = false } = {}) {
    // Read the live URL, not this render's copy: the debounced search may run after other changes.
    const next = new URLSearchParams(window.location.search);
    if (!("page" in changes)) next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    const qs = next.toString();
    navigate(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { replace });
  }

  const clear = () => navigate(window.location.pathname);
  const now = unit && periodStart(unit, today);
  const step =
    unit && start && now
      ? {
          label: periodLabel(unit, start),
          unit,
          /** On today's month, week or day (not "Last month", not a stepped one). */
          isCurrent: start === now,
          go(delta: number) {
            const next = shiftPeriod(unit, start, delta);
            // "Last month" stepped becomes a plain month; reaching the current period drops "at" for a clean URL.
            update({ range: unit === "month" ? "month" : range, at: next === now ? undefined : unit === "month" ? next.slice(0, 7) : next });
          },
          reset: () => update({ range: unit === "month" ? "month" : range, at: undefined }),
        }
      : null;
  const filtered = range !== "month" || stepped !== undefined || categoryId !== undefined || cardId !== undefined || q !== undefined;

  return { type, range, from, to, step, stepped: stepped !== undefined, categoryId, cardId, q, page, pageSize, update, clear, filtered };
}

export type TransactionFiltersState = ReturnType<typeof useTransactionFilters>;
