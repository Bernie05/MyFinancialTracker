import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./Card.css";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Card heading. Rendered as an h2 unless `headingLevel` says otherwise; also names the section. */
  title?: ReactNode;
  /** One short line under the title: the period or scope ("October 2026"). */
  subtitle?: ReactNode;
  /** A control at the top-right: a ghost Button or a SegmentedControl. */
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  /** "none" lets a list run edge to edge (transaction lists). Default "md". */
  padding?: "none" | "md";
}

/** Groups one topic on a screen: this month's budget, a goal, recent transactions. */
export function Card({
  title,
  subtitle,
  action,
  headingLevel = 2,
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as const;
  const hasHeader = title != null || action != null;

  return (
    <section
      className={cx("mft-card", `mft-card--pad-${padding}`, className)}
      aria-labelledby={title != null ? headingId : undefined}
      {...rest}
    >
      {hasHeader && (
        <header className="mft-card__header">
          <div className="mft-card__titles">
            {title != null && (
              <Heading id={headingId} className="mft-card__title">
                {title}
              </Heading>
            )}
            {subtitle != null && <p className="mft-card__subtitle">{subtitle}</p>}
          </div>
          {action != null && <div className="mft-card__action">{action}</div>}
        </header>
      )}
      <div className="mft-card__body">{children}</div>
    </section>
  );
}
