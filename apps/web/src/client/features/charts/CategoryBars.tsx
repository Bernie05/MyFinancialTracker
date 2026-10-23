import { formatMoney } from "@mft/ui";
import { useState } from "react";
import type { MonthSummary } from "../../../shared/contracts";
import { ColorDot } from "../../layout/ColorDot";
import { EmptyState } from "../../layout/EmptyState";
import { categoryColor } from "../../lib/categoryColor";

type Item = MonthSummary["expenseByCategory"][number];

/**
 * Spending by parent category as labelled bars, largest first. A parent with subcategories is a
 * button: open it to see the split (subcategory bars use a lighter shade of the parent's color).
 * Every value is printed, so nothing rests on color.
 */
export function CategoryBars({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number[]>([]);
  const total = items.reduce((sum, i) => sum + i.totalMinor, 0);
  if (total === 0) return <EmptyState heading="No expenses this month yet">Spending by category shows up here once you add an expense.</EmptyState>;
  const max = Math.max(...items.map((i) => i.totalMinor));
  const pct = (minor: number) => `${Math.round((minor / total) * 100)}%`;

  return (
    <ul className="cat-bars">
      {items.map(({ category, totalMinor, children }) => {
        const color = categoryColor(category.color);
        const expandable = children.length > 0;
        const isOpen = open.includes(category.id);
        const subCount = children.filter((c) => c.category.id !== category.id).length;
        const head = (
          <>
            <span className="cat-bars__name">
              <ColorDot color={color} />
              {category.name}
              {expandable && <span className="cat-bars__count">{subCount} subcategor{subCount === 1 ? "y" : "ies"}</span>}
            </span>
            <span className="cat-bars__value">
              {formatMoney(totalMinor)} <span>· {pct(totalMinor)}</span>
            </span>
            <span className="cat-bars__track" aria-hidden="true">
              <span className="cat-bars__bar" style={{ width: `${(totalMinor / max) * 100}%`, background: color }} />
            </span>
          </>
        );
        return (
          <li key={category.id}>
            {expandable ? (
              <button
                type="button"
                className="cat-bars__row cat-bars__toggle"
                aria-expanded={isOpen}
                onClick={() => setOpen((ids) => (isOpen ? ids.filter((id) => id !== category.id) : [...ids, category.id]))}
              >
                {head}
              </button>
            ) : (
              <div className="cat-bars__row">{head}</div>
            )}
            {expandable && isOpen && (
              <ul className="cat-bars__children">
                {children.map((child) => (
                  <li key={child.category.id} className="cat-bars__row cat-bars__row--child">
                    <span className="cat-bars__name">{child.category.id === category.id ? "No subcategory" : child.category.name}</span>
                    <span className="cat-bars__value">
                      {formatMoney(child.totalMinor)} <span>· {pct(child.totalMinor)}</span>
                    </span>
                    <span className="cat-bars__track" aria-hidden="true">
                      <span
                        className="cat-bars__bar"
                        style={{ width: `${(child.totalMinor / max) * 100}%`, background: `color-mix(in srgb, ${color} 60%, var(--surface-raised))` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
