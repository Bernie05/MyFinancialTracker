import { Amount, Button, formatMoney, ProgressMeter } from "@mft/ui";
import { useState } from "react";
import type { CardSummary } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { CardIcon, PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { linkClick, navigate } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { CardEditor } from "./CardEditor";
import { dueText } from "../../lib/alerts";
import { shortDate, todayLocal } from "../../lib/dates";
import { CardFace, StatusChip } from "./CardFace";

/** One card in the grid: the face, what's due and when, and how much of the limit is used. */
function CardTile({ card }: { card: CardSummary }) {
  const { summary } = card;
  return (
    <li>
      <a className="card-tile" href={`/cards/${card.id}`} onClick={linkClick}>
        <CardFace card={card} />
        <div className="card-tile__body">
          <div className="card-tile__due">
            <div className="card-tile__balance">
              <span className="card-tile__label">{summary.remainingDueMinor > 0 ? `Due ${shortDate(summary.dueDate)}` : "Amount due"}</span>
              <Amount minorUnits={summary.remainingDueMinor} size="lg" tone="neutral" />
            </div>
            <StatusChip summary={summary} />
          </div>
          <ProgressMeter
            kind="budget"
            label="Credit used"
            value={card.limitMinor - summary.availableMinor}
            max={card.limitMinor}
            warnAt={0.7}
            valueText={`${summary.utilisationPct}% of ${formatMoney(card.limitMinor)}`}
          />
        </div>
      </a>
    </li>
  );
}

/** One line above the grid: what's due this month across cards, and the next due date. */
function Totals({ cards }: { cards: CardSummary[] }) {
  const month = todayLocal().slice(0, 7);
  const owing = cards.filter((c) => c.summary.remainingDueMinor > 0);
  const thisMonth = owing.filter((c) => c.summary.dueDate.slice(0, 7) <= month).reduce((sum, c) => sum + c.summary.remainingDueMinor, 0);
  const next = [...owing].sort((a, b) => a.summary.dueDate.localeCompare(b.summary.dueDate))[0];
  return (
    <section className="cards-total" aria-label="Totals">
      <div>
        <span className="card-tile__label">Due this month</span>
        <Amount minorUnits={thisMonth} size="lg" tone="neutral" />
      </div>
      <div>
        <span className="card-tile__label">Next due</span>
        <strong className="cards-total__next">
          {next ? `${next.name}, ${shortDate(next.summary.dueDate)} (${dueText(next.summary.daysUntilDue).toLowerCase()})` : "Nothing due"}
        </strong>
      </div>
    </section>
  );
}

export function CardsPage() {
  const list = useAsync(() => api.listCards(), []);
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <PageHeader
        title="Credit Cards"
        subtitle="What you owe on each card, and when it's due"
        actions={
          <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
            Add card
          </Button>
        }
      />

      <Loadable state={list.state} reload={list.reload} what="your cards" skeleton="bars">
        {(cards) => {
          const active = cards.filter((c) => !c.archived);
          const archived = cards.filter((c) => c.archived);
          return (
            <>
              {active.length > 0 && <Totals cards={active} />}
              {active.length === 0 ? (
                <section className="panel panel--empty" aria-label="No cards yet">
                  <EmptyState
                    icon={<CardIcon />}
                    heading="No credit cards yet"
                    action={
                      <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
                        Add card
                      </Button>
                    }
                  >
                    Add a card to see its balance, statement and due date, and to get a reminder before it's due.
                  </EmptyState>
                </section>
              ) : (
                <ul className="card-grid">{active.map((c) => <CardTile key={c.id} card={c} />)}</ul>
              )}
              {archived.length > 0 && (
                <details className="archived">
                  <summary>Archived cards ({archived.length})</summary>
                  <ul className="card-grid">{archived.map((c) => <CardTile key={c.id} card={c} />)}</ul>
                </details>
              )}
            </>
          );
        }}
      </Loadable>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add card">
        {adding && (
          <CardEditor
            card={null}
            all={list.state.data ?? []}
            onSaved={(_message, id) => {
              setAdding(false);
              navigate(`/cards/${id}`);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
