import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import { Amount } from "../Amount";
import { Badge } from "../Badge";
import "./TransactionRow.css";

export interface TransactionRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Payee or what it was for: "Puregold Cubao", "October salary". */
  description: string;
  /** Category name; shown as a Badge. */
  category: string;
  /** Category color slot 1–6 (see Badge). */
  categoryColor?: 1 | 2 | 3 | 4 | 5 | 6 | string;
  /** When it happened. A Date is formatted with `locale`; a string is shown as given. */
  date: Date | string;
  /** Signed integer minor units: negative = expense, positive = income. */
  minorUnits: number;
  currency?: string;
  locale?: string;
  /** Extra line under the description: account, note, "Recurring". */
  meta?: ReactNode;
  /** Trailing control, e.g. a small ghost "Edit" Button. */
  action?: ReactNode;
}

/**
 * One ledger line. Place rows in a <ul>/<li> list or directly inside a Card with
 * padding="none"; rows draw their own dividers.
 */
export function TransactionRow({
  description,
  category,
  categoryColor,
  date,
  minorUnits,
  currency,
  locale = "en-PH",
  meta,
  action,
  className,
  ...rest
}: TransactionRowProps) {
  const dateLabel =
    typeof date === "string" ? date : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const dateTime = typeof date === "string" ? undefined : date.toISOString().slice(0, 10);

  return (
    <div className={cx("mft-txn", className)} {...rest}>
      {/* Category monogram: decorative, the chip beside the date names the category. */}
      <span
        className="mft-txn__avatar"
        style={
          categoryColor
            ? ({
                "--mft-txn-hue": typeof categoryColor === "number" ? `var(--chart-${categoryColor})` : categoryColor,
              } as CSSProperties)
            : undefined
        }
        aria-hidden="true"
      >
        {category.trim().charAt(0).toUpperCase()}
      </span>
      <div className="mft-txn__main">
        <p className="mft-txn__description">{description}</p>
        <p className="mft-txn__meta">
          <Badge category={categoryColor}>{category}</Badge>
          <time dateTime={dateTime}>{dateLabel}</time>
          {meta != null && <span>{meta}</span>}
        </p>
      </div>
      <Amount
        className="mft-txn__amount"
        minorUnits={minorUnits}
        currency={currency}
        locale={locale}
        signDisplay="always"
        // Money in is green; ordinary spending stays in ink, so red keeps meaning "over budget".
        tone={minorUnits > 0 ? "income" : "neutral"}
      />
      {action != null && <div className="mft-txn__action">{action}</div>}
    </div>
  );
}
