import { Amount, Card } from "@mft/ui";
import type { CardSummary } from "../../../shared/contracts";
import { ColorDot } from "../../layout/ColorDot";
import { EmptyState } from "../../layout/EmptyState";
import { Loadable } from "../../layout/Loadable";
import { dueText } from "../../lib/alerts";
import { categoryColor } from "../../lib/categoryColor";
import { shortDate } from "../../lib/dates";
import { cardPath } from "../../lib/cardPaths";
import { linkClick } from "../../lib/router";
import type { AsyncState } from "../../lib/useAsync";

/** Every active card with something left to pay on its statement, soonest due first. */
export function UpcomingDues({ state, reload }: { state: AsyncState<CardSummary[]>; reload: () => void }) {
  return (
    <Card title="Upcoming due dates" subtitle="Credit card statements still to pay" className="dash-fixed">
      <div className="dash-fixed__scroll" tabIndex={0} role="region" aria-label="Upcoming due dates list">
      <Loadable state={state} reload={reload} what="due dates" skeleton="rows">
        {(cards) => {
          const due = cards
            .filter((c) => !c.archived && c.summary.status !== "paid" && c.summary.remainingDueMinor > 0)
            .sort((a, b) => a.summary.dueDate.localeCompare(b.summary.dueDate));
          if (due.length === 0) {
            return (
              <EmptyState heading="Nothing due right now">
                {cards.some((c) => !c.archived) ? "Every card's statement is paid." : "Add a credit card to see its due dates here."}
              </EmptyState>
            );
          }
          return (
            <ul className="dues">
              {due.map((c) => {
                const tone = c.summary.status === "overdue" ? "overdue" : c.summary.status === "due_soon" ? "soon" : "later";
                return (
                  <li key={c.id}>
                    <a className={`dues__row dues__row--${tone}`} href={cardPath(c)} onClick={linkClick}>
                      <span className="dues__date" aria-hidden="true">
                        <span>{shortDate(c.summary.dueDate).split(" ")[0]}</span>
                        <strong>{shortDate(c.summary.dueDate).split(" ")[1]}</strong>
                      </span>
                      <span className="dues__main">
                        <span className="dues__name">
                          <ColorDot color={categoryColor(c.color)} /> {c.name}
                        </span>
                        <span className="dues__when">
                          {c.last4 && `···· ${c.last4} · `}
                          {dueText(c.summary.daysUntilDue)}
                        </span>
                      </span>
                      <Amount minorUnits={c.summary.remainingDueMinor} size="md" tone="neutral" />
                    </a>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </Loadable>
      </div>
    </Card>
  );
}
