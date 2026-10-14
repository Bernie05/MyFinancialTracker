import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import { ArrowDownRight, ArrowUpRight, Minus } from "../../lib/icons";
import { Amount } from "../Amount";
import "./StatTile.css";

export interface StatTrend {
  direction: "up" | "down" | "flat";
  /**
   * Whether this direction is good news. Spending going up is bad; income going up is good —
   * the component can't know, so the caller says.
   */
  sentiment: "positive" | "negative" | "neutral";
  /** What changed and against what: "₱2,300 more than September". */
  text: ReactNode;
}

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  /** What the number is: "Spent this month", "Saved", "Net worth". */
  label: string;
  /** Integer minor units. */
  minorUnits: number;
  currency?: string;
  locale?: string;
  /** Optional change line with an arrow, so the trend never rests on color alone. */
  trend?: StatTrend;
  /** Use "display" for the one hero figure per screen. Default "lg". */
  size?: "lg" | "display";
}

const trendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

/** One headline figure with its label and an optional trend. Lay several out in a row on the dashboard. */
export function StatTile({
  label,
  minorUnits,
  currency,
  locale,
  trend,
  size = "lg",
  className,
  ...rest
}: StatTileProps) {
  const Icon = trend ? trendIcon[trend.direction] : null;
  return (
    <div className={cx("mft-stat", `mft-stat--${size}`, className)} {...rest}>
      <p className="mft-stat__label">{label}</p>
      <Amount minorUnits={minorUnits} currency={currency} locale={locale} size={size} tone="neutral" />
      {trend && Icon && (
        <p className={cx("mft-stat__trend", `mft-stat__trend--${trend.sentiment}`)}>
          <Icon />
          <span>{trend.text}</span>
        </p>
      )}
    </div>
  );
}
