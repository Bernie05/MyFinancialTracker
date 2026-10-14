import { Button, TransactionRow } from "@mft/ui";
import type { Transaction } from "../../../shared/contracts";
import { shortDate } from "../../lib/dates";

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (tx: Transaction) => void;
  deletingId: number | null;
}

export function TransactionList({ transactions, onDelete, deletingId }: TransactionListProps) {
  if (transactions.length === 0) {
    return <p className="empty">No transactions this month yet. Add your first one with the form.</p>;
  }

  return (
    <ul className="tx-list">
      {transactions.map((tx) => (
        <li key={tx.id}>
          <TransactionRow
            description={tx.description}
            category={tx.category.name}
            categoryColor={tx.category.color as 1 | 2 | 3 | 4 | 5 | 6}
            date={shortDate(tx.occurredOn)}
            // Stored positive with a type; the ledger shows money out as negative.
            minorUnits={tx.type === "expense" ? -tx.amountMinor : tx.amountMinor}
            meta={tx.note ?? undefined}
            action={
              <Button
                variant="ghost"
                size="sm"
                loading={deletingId === tx.id}
                onClick={() => onDelete(tx)}
                aria-label={`Delete ${tx.description}`}
              >
                Delete
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
