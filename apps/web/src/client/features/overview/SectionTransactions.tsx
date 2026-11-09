import { Card, formatMoney } from "@mft/ui";
import { useState } from "react";
import type { Card as CardRef, Transaction, TransactionFilters, TransactionType } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { EmptyState } from "../../layout/EmptyState";
import { Loadable } from "../../layout/Loadable";
import { refreshAlerts } from "../../lib/alerts";
import { monthLabel } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { EditTransactionDialog } from "../transactions/EditTransactionDialog";
import { TransactionList } from "../transactions/TransactionList";

export interface SectionTransactionsProps {
  type: TransactionType;
  /** YYYY-MM: the dashboard's month. */
  month: string;
  /** The section's scope plus the pick (paidWith, cardId, categoryId…). */
  filters: Pick<TransactionFilters, "paidWith" | "cardId" | "categoryId" | "excludeCategoryId">;
  /** What "Paid with" offers when editing: the section's own accounts (none for cash). */
  cards: (CardRef & { archived?: boolean })[];
  /** Cash or debit can be picked when editing (Cash & Others only). */
  allowCash: boolean;
  /** Shown when the month is empty. */
  emptyText: string;
  /** Bump to refetch, e.g. after something was added elsewhere on the page. */
  reloadKey?: number;
  /** After an edit or delete: the page refreshes its dashboard. */
  onChanged?: () => void;
}

/**
 * The month's transactions in a section (or for the picked account or category), newest first, in a
 * scrollable card with Edit and Delete. Online Credit, Credit Cards and Cash & Others all use it.
 * Billed loan and installment months are read-only here: their plan manages them.
 */
export function SectionTransactions({ type, month, filters, cards, allowCash, emptyText, reloadKey = 0, onChanged }: SectionTransactionsProps) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const list = useAsync(
    (signal) => api.listTransactions({ type, from: `${month}-01`, to, ...filters, page: 1, pageSize: 100 }, signal),
    [type, month, JSON.stringify(filters), reloadKey],
  );
  const categories = useAsync(() => api.listCategories(), []);
  const [editing, setEditing] = useState<Transaction | null>(null);

  function changed() {
    list.reload();
    refreshAlerts(); // a charge changes what's owed
    onChanged?.();
  }

  const page = list.state.data;
  const count = page ? `${page.total} transaction${page.total === 1 ? "" : "s"}` : "";
  const total = page ? (type === "expense" ? page.expenseMinor : page.incomeMinor) : 0;
  return (
    <Card
      title="Transactions"
      subtitle={page ? `${monthLabel(month)} · ${count} · ${formatMoney(total)}` : monthLabel(month)}
      padding="none"
      className="section-dash__list"
    >
      <Loadable state={list.state} reload={list.reload} what="the transactions" skeleton="rows">
        {(p) =>
          p.items.length === 0 ? (
            <EmptyState heading={`Nothing in ${monthLabel(month)}`}>{emptyText}</EmptyState>
          ) : (
            <div className="loan-dues__scroll section-tx__scroll" tabIndex={0} role="region" aria-label={`Transactions in ${monthLabel(month)}`}>
              <TransactionList
                transactions={p.items}
                showCard={cards.length > 1 || filters.cardId === undefined}
                onEdit={setEditing}
                onDelete={async (tx) => {
                  await api.deleteTransaction(tx.id);
                  changed();
                }}
              />
            </div>
          )
        }
      </Loadable>

      <EditTransactionDialog
        transaction={editing}
        categories={categories.state.data ?? []}
        cards={cards}
        allowCash={allowCash}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          changed();
        }}
      />
    </Card>
  );
}
