import type { TransactionType } from "../../../shared/contracts";
import { presetRange, rangePresets, type RangePreset } from "../../lib/dates";
import { navigate, useSearch } from "../../lib/router";

export const PAGE_SIZES = [10, 20, 50, 100] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The list's filters and page live in the URL query string, so a reload or a shared link
 * keeps them and Back/Forward step through them. Anything malformed falls back to the default.
 */
export function useTransactionFilters(type: TransactionType) {
  const params = new URLSearchParams(useSearch());
  const get = (key: string) => params.get(key) ?? undefined;

  const rangeParam = get("range");
  const range: RangePreset = rangePresets.some((p) => p.value === rangeParam) ? (rangeParam as RangePreset) : "month";
  const { from, to } =
    range === "custom"
      ? { from: DATE.test(get("from") ?? "") ? get("from") : undefined, to: DATE.test(get("to") ?? "") ? get("to") : undefined }
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
  const filtered = range !== "month" || categoryId !== undefined || cardId !== undefined || q !== undefined;

  return { type, range, from, to, categoryId, cardId, q, page, pageSize, update, clear, filtered };
}

export type TransactionFiltersState = ReturnType<typeof useTransactionFilters>;
