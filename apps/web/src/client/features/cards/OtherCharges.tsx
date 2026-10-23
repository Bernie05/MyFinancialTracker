import { Badge, Button, formatMoney } from "@mft/ui";
import { useState } from "react";
import type { CardSummary, Category, Transaction } from "../../../shared/contracts";
import { addDays, closeInMonth } from "../../../shared/cardCycle";
import { api } from "../../api/endpoints";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { categoryColor } from "../../lib/categoryColor";
import { shortDate } from "../../lib/dates";
import { linkClick } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { AddTransactionForm } from "../transactions/AddTransactionForm";
import { EditTransactionDialog } from "../transactions/EditTransactionDialog";

const MAX_BACK = 12; // statements you can step back through
const LIMIT = 100; // a cycle rarely has more; past that, "View all charges" has the full list

interface OtherChargesProps {
  card: CardSummary;
  categories: Category[];
  /** Active cards for the add form's "Paid with". */
  cards: CardSummary[];
  onChanged: (message: string) => void;
}

/**
 * The card's everyday charges (not installment months) for one statement cycle, grouped by parent
 * category. Starts on the open cycle; ‹ › steps through past statements.
 */
export function OtherCharges({ card, categories, cards, onChanged }: OtherChargesProps) {
  const [back, setBack] = useState(0);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Cycle `back` statements ago: (previous close + 1 day) .. close.
  const month = card.summary.cycleTo.slice(0, 7);
  const to = closeInMonth(month, card.closingDay, -back);
  const from = addDays(closeInMonth(month, card.closingDay, -back - 1), 1);
  const list = useAsync(
    () => api.listTransactions({ type: "expense", cardId: card.id, installment: "none", from, to, pageSize: LIMIT }),
    [card.id, from, to],
  );

  function changed(message: string) {
    list.reload();
    onChanged(message);
  }

  const cycleLabel = `${shortDate(from)} – ${shortDate(to)}`;
  const data = list.state.data;

  return (
    <details className="pgroup" open>
      <summary className="pgroup__head">
        <span className="pgroup__title">
          <span className="pgroup__name">Other charges</span>
          <span className="pgroup__sub">
            {data ? `${data.total} charge${data.total === 1 ? "" : "s"}` : "Loading"} · {back === 0 ? "this cycle" : "past statement"}
          </span>
        </span>
        <span className="pgroup__figures">
          <span className="pgroup__amount">{formatMoney(data?.expenseMinor ?? 0)}</span>
          <span className="pgroup__sub">{cycleLabel}</span>
        </span>
      </summary>

      <div className="oc-toolbar">
        <nav className="month-stepper month-stepper--sm" aria-label="Statement cycle">
          <button type="button" className="icon-button" aria-label="Previous statement" disabled={back >= MAX_BACK} onClick={() => setBack((b) => b + 1)}>
            <ChevronLeftIcon />
          </button>
          <span className="month-stepper__label" aria-live="polite">
            {cycleLabel}
          </span>
          <button type="button" className="icon-button" aria-label="Next statement" disabled={back === 0} onClick={() => setBack((b) => b - 1)}>
            <ChevronRightIcon />
          </button>
        </nav>
        <span className="oc-toolbar__actions">
          <a className="link-text" href={`/expenses?range=all&cardId=${card.id}`} onClick={linkClick}>
            View all charges
          </a>
          <Button size="sm" iconStart={<PlusIcon />} onClick={() => setAdding(true)} disabled={card.archived}>
            Add charge
          </Button>
        </span>
      </div>

      <Loadable state={list.state} reload={list.reload} what="charges" skeleton="rows">
        {(result) => {
          if (result.total === 0) {
            return <EmptyState heading={back === 0 ? "No other charges this cycle" : "No other charges on that statement"}>Installment months are listed under their plans.</EmptyState>;
          }
          // Group by parent category; a charge on a subcategory goes under its parent with a chip.
          const groups = new Map<number, { category: Category; total: number; items: Transaction[] }>();
          for (const tx of result.items) {
            const rootId = tx.category.parentId ?? tx.category.id;
            const root = categories.find((c) => c.id === rootId) ?? tx.category;
            const group = groups.get(rootId) ?? { category: root, total: 0, items: [] };
            group.total += tx.amountMinor;
            group.items.push(tx); // already newest first
            groups.set(rootId, group);
          }
          const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
          const openAll = sorted.length <= 3;
          return (
            <>
              <div className="oc-groups">
                {sorted.map((g, i) => {
                  const color = categoryColor(g.category.color);
                  return (
                    <details key={`${g.category.id}-${from}`} className="oc-group" open={openAll || i === 0}>
                      <summary className="oc-group__head">
                        <span className="cat-row__swatch" style={{ background: color }} aria-hidden="true" />
                        <span className="oc-group__name">{g.category.name}</span>
                        <span className="oc-group__count">
                          {g.items.length} charge{g.items.length === 1 ? "" : "s"}
                        </span>
                        <span className="oc-group__total">{formatMoney(g.total)}</span>
                      </summary>
                      <ul className="pgroup__rows">
                        {g.items.map((tx) => (
                          <li key={tx.id} className="prow oc-row">
                            <span className="prow__date">{shortDate(tx.occurredOn)}</span>
                            <span className="oc-row__desc">
                              <span className="oc-row__text">{tx.description}</span>
                              {tx.category.parentId !== null && <Badge category={color}>{tx.category.name}</Badge>}
                            </span>
                            <span className="prow__amount">{formatMoney(tx.amountMinor)}</span>
                            <span className="row-actions">
                            <button
                              type="button"
                              className="icon-button icon-button--sm"
                              aria-label={`Edit ${tx.description}`}
                              title="Edit"
                              onClick={() => setEditing(tx)}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className="icon-button icon-button--sm"
                              aria-label={`Delete ${tx.description}`}
                              title="Delete"
                              onClick={() => setDeleting(tx)}
                            >
                              <TrashIcon />
                            </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
              {result.total > result.items.length && (
                <p className="oc-more">
                  Showing the newest {result.items.length} of {result.total}.{" "}
                  <a className="link-text" href={`/expenses?range=custom&from=${from}&to=${to}&cardId=${card.id}`} onClick={linkClick}>
                    See them all
                  </a>
                </p>
              )}
            </>
          );
        }}
      </Loadable>

      <Dialog open={adding} onClose={() => setAdding(false)} title={`Add a charge to ${card.name}`}>
        {adding && (
          <div className="dialog__body">
          <AddTransactionForm
            type="expense"
            categories={categories}
            cards={cards.filter((c) => !c.archived)}
            defaultCardId={card.id}
            onAdded={(message) => {
              setAdding(false);
              setBack(0);
              changed(message);
            }}
          />
          </div>
        )}
      </Dialog>

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        cards={cards}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          changed(message);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.description}”?` : "Delete charge?"}
        message={deleting ? `This ${formatMoney(deleting.amountMinor)} charge on ${shortDate(deleting.occurredOn)} will be removed from your totals and from ${card.name}.` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          await api.deleteTransaction(deleting.id);
          changed(`${deleting.description} deleted`);
        }}
        onClose={() => setDeleting(null)}
      />
    </details>
  );
}
