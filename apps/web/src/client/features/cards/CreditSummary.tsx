import { Amount, formatMoney, ProgressMeter } from "@mft/ui";
import type { CardSummary } from "../../../shared/contracts";

/** Limit, used (billed balance plus installment and loan amounts not billed yet) and what's left, over some cards. */
export function creditTotals(cards: CardSummary[]) {
  const active = cards.filter((c) => !c.archived);
  const limitMinor = active.reduce((sum, c) => sum + c.limitMinor, 0);
  const availableMinor = active.reduce((sum, c) => sum + Math.max(0, c.summary.availableMinor), 0);
  return { count: active.length, limitMinor, availableMinor, usedMinor: limitMinor - availableMinor };
}

/**
 * Total credit limit minus the credit used = the credit still available, over every active card given.
 * `parts` adds one line per group underneath (online credit, bank cards) that sums to the totals.
 */
export function CreditSummary({ cards, title = "Credit", parts }: {
  cards: CardSummary[];
  title?: string;
  parts?: { label: string; cards: CardSummary[] }[];
}) {
  const t = creditTotals(cards);
  if (t.count === 0) return null;
  const pct = t.limitMinor > 0 ? Math.round((t.usedMinor / t.limitMinor) * 100) : 0;
  return (
    <section className="credit-sum" aria-label={title}>
      <div className="credit-sum__figures">
        <div>
          <span className="credit-sum__label">Total credit limit</span>
          <Amount minorUnits={t.limitMinor} size="lg" tone="neutral" />
          <span className="credit-sum__note">
            {t.count} account{t.count === 1 ? "" : "s"}
          </span>
        </div>
        <span className="credit-sum__op" aria-hidden="true">
          −
        </span>
        <div>
          <span className="credit-sum__label">Credit used</span>
          <Amount minorUnits={t.usedMinor} size="lg" tone="neutral" />
          <span className="credit-sum__note">Balance plus loans not billed yet</span>
        </div>
        <span className="credit-sum__op" aria-hidden="true">
          =
        </span>
        <div className="credit-sum__result">
          <span className="credit-sum__label">Available credit</span>
          <Amount minorUnits={t.availableMinor} size="lg" tone="neutral" />
          <span className="credit-sum__note">What you can still use</span>
        </div>
      </div>
      <ProgressMeter
        kind="budget"
        label="Credit used"
        value={t.usedMinor}
        max={Math.max(t.limitMinor, 1)}
        warnAt={0.7}
        valueText={`${pct}% of ${formatMoney(t.limitMinor)}`}
      />
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
    </section>
  );
}
