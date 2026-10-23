import { Button, Select, TextField } from "@mft/ui";
import { useEffect, useState } from "react";
import type { Category } from "../../../shared/contracts";
import { ColorDot } from "../../layout/ColorDot";
import { SearchIcon } from "../../layout/icons";
import { categoryColor } from "../../lib/categoryColor";
import { categoryOptions } from "../../lib/categoryOptions";
import { rangePresets } from "../../lib/dates";
import type { TransactionFiltersState } from "./useTransactionFilters";

interface TransactionFiltersProps {
  filters: TransactionFiltersState;
  categories: Category[];
  /** When the list is narrowed to one card (cardId in the URL), its name for the removable chip. */
  cardName?: string;
}

/** One row of filters above the list: date range, category, search. Every change resets to page 1. */
export function TransactionFilters({ filters, categories, cardName }: TransactionFiltersProps) {
  const { range, from, to, categoryId, q, update, clear, filtered, type } = filters;
  const [text, setText] = useState(q ?? "");

  // Back/Forward or "Clear filters" can change q from outside; keep the box in sync.
  useEffect(() => setText(q ?? ""), [q]);

  // Search as you type, debounced; replace the history entry so Back doesn't replay every keystroke.
  useEffect(() => {
    if (text.trim() === (q ?? "")) return;
    const timer = setTimeout(() => update({ q: text.trim() }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [text]); // only typing triggers it; q and update are read fresh on each run

  const selected = categories.find((c) => c.id === categoryId);
  const toError = from && to && from > to ? "The end date is before the start date." : undefined;

  return (
    <section className="filters" aria-label="Filters">
      <Select
        label="Date range"
        value={range}
        options={rangePresets}
        // Switching to custom starts from the dates currently shown, so nothing jumps.
        onChange={({ target: { value } }) => update(value === "custom" ? { range: value, from, to } : { range: value, from: undefined, to: undefined })}
      />
      {range === "custom" && (
        <>
          <TextField label="From" type="date" value={from ?? ""} onChange={(e) => update({ from: e.target.value })} />
          <TextField label="To" type="date" value={to ?? ""} onChange={(e) => update({ to: e.target.value })} error={toError} />
        </>
      )}
      <Select
        label="Category"
        value={categoryId ? String(categoryId) : ""}
        prefix={selected && <ColorDot color={categoryColor(selected.color)} />}
        options={[
          { value: "", label: "All categories" },
          ...categoryOptions(categories, type), // a parent also matches its subcategories
        ]}
        onChange={({ target: { value } }) => update({ categoryId: value })}
      />
      <TextField
        label="Search"
        type="search"
        prefix={<SearchIcon />}
        className="filters__search"
        placeholder="Description or note"
        maxLength={100}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {filters.cardId !== undefined && (
        <span className="filter-chip">
          Paid with {cardName ?? "a card"}
          <button type="button" className="filter-chip__remove" aria-label={`Show all cards, not just ${cardName ?? "this card"}`} onClick={() => update({ cardId: undefined })}>
            ×
          </button>
        </span>
      )}
      {filtered && (
        <Button variant="ghost" size="sm" onClick={clear} className="filters__clear">
          Clear filters
        </Button>
      )}
    </section>
  );
}
