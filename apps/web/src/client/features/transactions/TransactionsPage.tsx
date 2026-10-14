import { Button, Card, StatTile } from "@mft/ui";
import { useState } from "react";
import type { Transaction } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { currentMonth, monthLabel, shiftMonth } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { AddTransactionForm } from "./AddTransactionForm";
import { TransactionList } from "./TransactionList";

/**
 * The first feature slice: a month's totals, the add form and the ledger.
 * Data flows one way. The page owns the month and refetches after every change;
 * children report what happened through callbacks.
 */
export function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [announcement, setAnnouncement] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const categories = useAsync(() => api.listCategories(), []);
  const transactions = useAsync(() => api.listTransactions(month), [month]);
  const summary = useAsync(() => api.getSummary(month), [month]);

  function refresh(message: string) {
    setAnnouncement(message);
    transactions.reload();
    summary.reload();
  }

  async function remove(tx: Transaction) {
    setDeletingId(tx.id);
    try {
      await api.deleteTransaction(tx.id);
      refresh(`${tx.description} deleted`);
    } catch {
      setAnnouncement(`Couldn't delete ${tx.description}. Try again.`);
    } finally {
      setDeletingId(null);
    }
  }

  const totals = summary.state.data;
  const isThisMonth = month === currentMonth();

  return (
    <main className="page">
      <header className="page__header">
        <h1 className="page__title">{monthLabel(month)}</h1>
        <nav className="month-nav" aria-label="Month">
          <Button variant="secondary" size="sm" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            Previous month
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={isThisMonth}>
            Next month
          </Button>
        </nav>
      </header>

      <section className="stats" aria-label="Month totals">
        <StatTile label="Income" minorUnits={totals?.incomeMinor ?? 0} />
        <StatTile label="Spent" minorUnits={totals?.expenseMinor ?? 0} />
        <StatTile
          label="Left over"
          minorUnits={totals?.netMinor ?? 0}
          trend={
            totals && totals.netMinor < 0
              ? { direction: "down", sentiment: "negative", text: "You spent more than you earned" }
              : undefined
          }
        />
      </section>

      <div className="page__grid">
        <Card title="Add a transaction" className="page__form">
          {categories.state.status === "error" ? (
            <p className="empty">Couldn't load categories. {categories.state.error.message}</p>
          ) : (
            <AddTransactionForm categories={categories.state.data ?? []} onAdded={refresh} />
          )}
        </Card>

        <Card title="Transactions" subtitle={monthLabel(month)} padding="none" className="page__list">
          {transactions.state.status === "error" ? (
            <div className="empty">
              <p>Couldn't load transactions. {transactions.state.error.message}</p>
              <Button variant="secondary" size="sm" onClick={transactions.reload}>
                Try again
              </Button>
            </div>
          ) : transactions.state.data ? (
            <TransactionList transactions={transactions.state.data} onDelete={remove} deletingId={deletingId} />
          ) : (
            <p className="empty">Loading transactions…</p>
          )}
        </Card>
      </div>

      {/* Screen readers hear the result of each action without moving focus. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
