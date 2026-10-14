import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";
import { formatMoneyParts, type MoneyFormatOptions } from "../../lib/money";
import "./Amount.css";

export type AmountTone = "auto" | "neutral" | "income" | "expense";
export type AmountSize = "sm" | "md" | "lg" | "display";

export interface AmountProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children">, MoneyFormatOptions {
  /** Integer minor units (centavos): 125050 is ₱1,250.50. Negative = money out. */
  minorUnits: number;
  /**
   * Color by direction. "auto" colors by sign only when `signDisplay` is "always"
   * (a ledger row); a balance stays `ink`. Default "auto".
   */
  tone?: AmountTone;
  /** sm = caption, md = body-strong (rows), lg = amount (tiles), display = the screen's headline figure. */
  size?: AmountSize;
}

/**
 * Renders money. Tabular figures keep columns aligned; the currency symbol sits
 * smaller than the digits so the number reads first. Every amount in the app goes
 * through this component — never format money inline.
 */
export function Amount({
  minorUnits,
  currency,
  locale,
  signDisplay = "auto",
  tone = "auto",
  size = "md",
  className,
  ...rest
}: AmountProps) {
  const parts = formatMoneyParts(minorUnits, { currency, locale, signDisplay });

  const resolvedTone: Exclude<AmountTone, "auto"> =
    tone !== "auto"
      ? tone
      : signDisplay === "always" && minorUnits !== 0
        ? minorUnits > 0
          ? "income"
          : "expense"
        : "neutral";

  const symbol = <span className="mft-amount__symbol">{parts.symbol}</span>;

  return (
    <span
      className={cx("mft-amount", `mft-amount--${size}`, `mft-amount--${resolvedTone}`, className)}
      aria-label={parts.text}
      {...rest}
    >
      <span aria-hidden="true">
        {parts.sign && <span className="mft-amount__sign">{parts.sign}</span>}
        {parts.symbolFirst && symbol}
        <span className="mft-amount__number">{parts.number}</span>
        {!parts.symbolFirst && <> {symbol}</>}
      </span>
    </span>
  );
}
