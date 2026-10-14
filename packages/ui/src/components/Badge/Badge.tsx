import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./Badge.css";

export type BadgeTone = "neutral" | "income" | "expense" | "goal";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Meaning, not decoration: income / expense / goal, or neutral for categories. Default "neutral". */
  tone?: BadgeTone;
  /**
   * A category color dot, 1–6, mapped to `chart-1` … `chart-6` so a category
   * looks the same in lists and in report charts.
   */
  category?: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}

/** A short label for a category or status: "Groceries", "Recurring", "Paid off". */
export function Badge({ tone = "neutral", category, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx("mft-badge", `mft-badge--${tone}`, className)} {...rest}>
      {category != null && (
        <span className="mft-badge__dot" style={{ background: `var(--chart-${category})` }} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
