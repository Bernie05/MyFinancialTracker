import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./Badge.css";

export type BadgeTone = "neutral" | "income" | "expense" | "goal";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Meaning, not decoration: income / expense / goal, or neutral for categories. Default "neutral". */
  tone?: BadgeTone;
  /**
   * A category color dot: 1–6 maps to `chart-1` … `chart-6`; a string is any CSS color
   * (`var(--cat-red)`, `#c0392b`). The text stays in ink, so any color is readable.
   * Give a category one color so it looks the same in lists and in report charts.
   */
  category?: 1 | 2 | 3 | 4 | 5 | 6 | string;
  children: ReactNode;
}

/** A short label for a category or status: "Groceries", "Recurring", "Paid off". */
export function Badge({ tone = "neutral", category, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx("mft-badge", `mft-badge--${tone}`, className)} {...rest}>
      {category != null && (
        <span className="mft-badge__dot" style={{ background: typeof category === "number" ? `var(--chart-${category})` : category }} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
