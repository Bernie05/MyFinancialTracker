import { Button, formatMoney, TransactionRow } from "@mft/ui";
import { useState } from "react";
import type { Transaction } from "../../../shared/contracts";
import { ColorDot } from "../../layout/ColorDot";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { EmptyState } from "../../layout/EmptyState";
import { startAddTransaction } from "../../layout/quickAdd";
import { categoryColor } from "../../lib/categoryColor";
import { shortDate } from "../../lib/dates";

interface TransactionListProps {
  /** Hide the "paid with" tag, e.g. on a card's own page where every row is that card. */
  showCard?: boolean;
  transactions: Transaction[];
  /** Called after the user confirms; throw to show the error in the dialog. */
  onDelete: (tx: Transaction) => Promise<void>;
  /** Opens the edit dialog for a row (not offered on billed installment months). */
  onEdit?: (tx: Transaction) => void;
}

/** "For Ana", or "Split · you ₱500" with everyone's part on hover. Nothing when it's all yours. */
function whoTag(tx: Transaction) {
  if (tx.shares.length === 0) return null;
  const everyone = [...(tx.myShareMinor > 0 ? [`You ${formatMoney(tx.myShareMinor)}`] : []), ...tx.shares.map((s) => `${s.name} ${formatMoney(s.amountMinor)}`)].join(" · ");
  const label = tx.myShareMinor === 0 && tx.shares.length === 1 ? `For ${tx.shares[0]!.name}` : `Split · you ${formatMoney(tx.myShareMinor)}`;
  return (
    <span className="who-tag" title={everyone}>
      {label}
      <span className="visually-hidden"> ({everyone})</span>
    </span>
  );
}

/** Extra line on a ledger row: who it's for, the card it was paid with (if any), then the note. */
export function transactionMeta(tx: Transaction, showCard = true) {
  const plan = tx.installmentId !== null && <span className="inst-tag">Installment</span>;
  const who = whoTag(tx);
  if (!tx.card || !showCard) {
    if (!plan && !who) return tx.note ?? undefined;
    return (
      <>
        {plan}
        {who}
        {tx.note && <span> {tx.note}</span>}
      </>
    );
  }
  return (
    <>
      {plan}
      {who}
      <span className="card-tag">
        <ColorDot color={categoryColor(tx.card.color)} />
        {tx.card.name}
        {tx.card.last4 && <span className="card-tag__last4"> ••{tx.card.last4}</span>}
      </span>
      {tx.note && <span> {tx.note}</span>}
    </>
  );
}

export function TransactionList({ transactions, onDelete, onEdit, showCard = true }: TransactionListProps) {
  const [confirming, setConfirming] = useState<Transaction | null>(null);
  if (transactions.length === 0) {
    return (
      <EmptyState heading="Nothing here yet" action={
        <Button variant="secondary" size="sm" onClick={startAddTransaction}>Add your first one</Button>
      }>
        No transactions in this date range. Add one with the form, or pick a wider range.
      </EmptyState>
    );
  }

  return (
    <>
    <ul className="tx-list">
      {transactions.map((tx) => (
        <li key={tx.id}>
          <TransactionRow
            description={tx.description}
            category={tx.category.name}
            categoryColor={categoryColor(tx.category.color)}
            date={shortDate(tx.occurredOn)}
            // Stored positive with a type; the ledger shows money out as negative.
            minorUnits={tx.type === "expense" ? -tx.amountMinor : tx.amountMinor}
            meta={transactionMeta(tx, showCard)}
            // Billed installment months are read-only: the plan on the card page manages them.
            action={
              tx.installmentId !== null ? undefined : (
                <span className="row-actions">
                  {onEdit && (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(tx)} aria-label={`Edit ${tx.description}`}>
                      Edit
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(tx)} aria-label={`Delete ${tx.description}`}>
                    Delete
                  </Button>
                </span>
              )
            }
          />
        </li>
      ))}
    </ul>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? `Delete “${confirming.description}”?` : "Delete transaction?"}
        message={
          confirming
            ? `This ${formatMoney(confirming.amountMinor)} ${confirming.type} on ${shortDate(confirming.occurredOn)} will be removed from your totals${confirming.card ? ` and from ${confirming.card.name}` : ""}.`
            : ""
        }
        onConfirm={() => onDelete(confirming!)}
        onClose={() => setConfirming(null)}
      />
    </>
  );
}
