import type { Card, Category, Transaction } from "../../../shared/contracts";
import { Dialog } from "../../layout/Dialog";
import { AddTransactionForm } from "./AddTransactionForm";

interface EditTransactionDialogProps {
  transaction: Transaction | null;
  categories: Category[];
  /** Cards for "Paid with"; archived ones are filtered out (the form keeps the current one). */
  cards: (Card & { archived?: boolean })[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** The add form, prefilled, in a dialog: one edit flow for every list of transactions. */
export function EditTransactionDialog({ transaction, categories, cards, onClose, onSaved }: EditTransactionDialogProps) {
  return (
    <Dialog open={transaction !== null} onClose={onClose} title={transaction ? `Edit “${transaction.description}”` : "Edit transaction"}>
      {transaction && (
        <div className="dialog__body">
          <AddTransactionForm
            key={transaction.id}
            type={transaction.type}
            categories={categories}
            cards={cards.filter((c) => !c.archived)}
            transaction={transaction}
            onAdded={onSaved}
          />
        </div>
      )}
    </Dialog>
  );
}
