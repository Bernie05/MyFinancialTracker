import { Amount, formatMoney, ProgressMeter } from "@mft/ui";
import type { ReactNode } from "react";
import type { CardSummary } from "../../../shared/contracts";

/** Limit, used (billed balance plus installment and loan amounts not billed yet) and what's left, over some cards. */
export function creditTotals(cards: CardSummary[]) {
  const active = cards.filter((c) => !c.archived);
  const limitMinor = active.reduce((sum, c) => sum + c.limitMinor, 0);
  const availableMinor = active.reduce((sum, c) => sum + Math.max(0, c.summary.availableMinor), 0);
  return { count: active.length, limitMinor, availableMinor, usedMinor: limitMinor - availableMinor };
}

/** One figure in a summary: label, amount and a short note under it. */
export interface SummaryFigure {
  label: string;
  minor: number;
  note: string;
}

/**
 * Limit − used = what's left, with a meter: the credit summary (limit − credit used = available) and
 * Cash & Others' budget summary (budget − spent = left) share this one design.
 */
export function LimitSummary({ title, limit, used, left, meterLabel, children }: {
  title: string;
  limit: SummaryFigure;
  used: SummaryFigure;
  left: SummaryFigure;
  meterLabel: string;
  children?: ReactNode;
}) {
  const pct = limit.minor > 0 ? Math.round((used.minor / limit.minor) * 100) : 0;
  return (
    <section className="credit-sum" aria-label={title}>
      <div className="credit-sum__figures">
        <div>
          <span className="credit-sum__label">{limit.label}</span>
          <Amount minorUnits={limit.minor} size="lg" tone="neutral" />
          <span className="credit-sum__note">{limit.note}</span>
        </div>
        <span className="credit-sum__op" aria-hidden="true">
          −
        </span>
        <div>
          <span className="credit-sum__label">{used.label}</span>
          <Amount minorUnits={used.minor} size="lg" tone="neutral" />
          <span className="credit-sum__note">{used.note}</span>
        </div>
        <span className="credit-sum__op" aria-hidden="true">
          =
        </span>
        <div className="credit-sum__result">
          <span className="credit-sum__label">{left.label}</span>
          <Amount minorUnits={left.minor} size="lg" tone="neutral" />
          <span className="credit-sum__note">{left.note}</span>
        </div>
      </div>
      <ProgressMeter
        kind="budget"
        label={meterLabel}
        value={used.minor}
        max={Math.max(limit.minor, 1)}
        warnAt={0.7}
        valueText={`${pct}% of ${formatMoney(limit.minor)}`}
      />
      {children}
    </section>
  );
}

/**
 * Total credit limit minus the credit used = the credit still available, over every active card given
 * (all zeros, with a hint, when there are none yet).
 * `parts` adds one line per group underneath (online credit, bank cards) that sums to the totals.
 */
export function CreditSummary({ cards, title = "Credit", parts }: {
  cards: CardSummary[];
  title?: string;
  parts?: { label: string; cards: CardSummary[] }[];
}) {
  const t = creditTotals(cards);
  return (
    <LimitSummary
      title={title}
      limit={{ label: "Total credit limit", minor: t.limitMinor, note: t.count === 0 ? "No accounts yet" : `${t.count} account${t.count === 1 ? "" : "s"}` }}
      used={{ label: "Credit used", minor: t.usedMinor, note: "Balance plus loans not billed yet" }}
      left={{ label: "Available credit", minor: t.availableMinor, note: "What you can still use" }}
      meterLabel="Credit used"
    >
      {parts && (
        <ul className="credit-sum__parts">
          {parts.map((p) => {
            const s = creditTotals(p.cards);
            return (
              <li key={p.label}>
                <span>{p.label}</span>
                <span>
                  {s.count === 0
                    ? "None yet"
                    : `${formatMoney(s.limitMinor)} − ${formatMoney(s.usedMinor)} used = ${formatMoney(s.availableMinor)} available`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </LimitSummary>
  );
}
