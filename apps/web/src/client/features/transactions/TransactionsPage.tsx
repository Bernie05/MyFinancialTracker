import { Button, Card, StatTile } from "@mft/ui";
import { useEffect, useState } from "react";
import type { Transaction, TransactionType } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { EmptyState } from "../../layout/EmptyState";
import { AlertIcon, SearchIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { refreshAlerts } from "../../lib/alerts";
import { rangeLabel } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { AddTransactionForm } from "./AddTransactionForm";
import { Pagination } from "./Pagination";
import { TransactionFilters } from "./TransactionFilters";
import { TransactionList } from "./TransactionList";
import { useTransactionFilters } from "./useTransactionFilters";

/**
 * One type of transaction (Expenses or Income page): filters, totals for the filtered set,
 * the add form and a paginated ledger. Filters and page live in the URL (useTransactionFilters);
 * the page refetches whenever they change and after every add or delete.
 */
const loadingFigure = <span className="skeleton__inline" aria-label="Loading" />;

export function TransactionsPage({ type }: { type: TransactionType }) {
  const filters = useTransactionFilters(type);
  const { from, to, categoryId, cardId, q, page, pageSize } = filters;
  const [announcement, setAnnouncement] = useState("");

  const categories = useAsync(() => api.listCategories(), []);
  const cards = useAsync(() => api.listCards(), []);
  const list = useAsync(
    () => api.listTransactions({ type, from, to, categoryId, cardId, q, page, pageSize }),
    [type, from, to, categoryId, cardId, q, page, pageSize],
  );

  // Deleting the last row of the last page (or a stale link) can leave us past the end: step back.
  // Only act on an empty answer for *this* page, never on the previous query's data during a refetch.
  const data = list.state.data;
  const pastEnd = list.state.status === "success" && !!data && data.page === page && data.items.length === 0 && data.total > 0;
  useEffect(() => {
    if (pastEnd && data) filters.update({ page: Math.ceil(data.total / data.pageSize) }, { replace: true });
  }, [pastEnd]); // update() reads the live URL, so it is safe to omit

  function refresh(message: string) {
    setAnnouncement(message);
    list.reload();
    refreshAlerts(); // a card expense changes what's owed
  }

  // Confirmed in the list's dialog; a failure throws back into it.
  async function remove(tx: Transaction) {
    await api.deleteTransaction(tx.id);
    refresh(`${tx.description} deleted`);
  }

  const noun = type === "expense" ? "Expenses" : "Income";
  const totalMinor = data ? (type === "expense" ? data.expenseMinor : data.incomeMinor) : 0;
  const loading = list.state.status === "loading";

  return (
    <div className="page">
      <PageHeader title={noun} subtitle={rangeLabel(from, to)} />

      <section className="stats" aria-label="Totals for these filters">
        <StatTile label={type === "expense" ? "Total spent" : "Total received"} minorUnits={totalMinor} value={data ? undefined : loadingFigure} />
        <StatTile label="Transactions" value={data ? data.total : loadingFigure} />
        <StatTile label="Average" minorUnits={data && data.total > 0 ? Math.round(totalMinor / data.total) : 0} value={data ? undefined : loadingFigure} />
      </section>

      <div className="ledger">
        <Card title={noun} subtitle={rangeLabel(from, to)} padding="none" className="ledger__list">
          {/* Filters, then count + pagination, then the list: all controls sit above the table. */}
          <div className="list-top">
            <TransactionFilters
              filters={filters}
              categories={categories.state.data ?? []}
              cardName={cardId ? cards.state.data?.find((c) => c.id === cardId)?.name : undefined}
            />
            {data && data.total > 0 && (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={(changes) => filters.update(changes)}
              />
            )}
          </div>
          <div aria-busy={loading} className={loading && data ? "is-refreshing" : undefined}>
            <Loadable state={list.state} reload={list.reload} what="transactions">
              {(result) =>
                result.total === 0 && filters.filtered ? (
                  <EmptyState
                    icon={<SearchIcon />}
                    heading="No transactions match these filters"
                    action={
                      <Button variant="secondary" size="sm" onClick={filters.clear}>
                        Clear filters
                      </Button>
                    }
                  >
                    Try a wider date range or another category.
                  </EmptyState>
                ) : (
                  <TransactionList transactions={result.items} onDelete={remove} />
                )
              }
            </Loadable>
          </div>
        </Card>

        <Card title={type === "expense" ? "Add an expense" : "Add income"} className="ledger__form">
          {categories.state.status === "error" ? (
            <EmptyState tone="error" icon={<AlertIcon />} heading="Couldn't load categories">
              {categories.state.error.message}
            </EmptyState>
          ) : (
            <AddTransactionForm
              type={type}
              categories={categories.state.data ?? []}
              cards={(cards.state.data ?? []).filter((c) => !c.archived)}
              onAdded={refresh}
            />
          )}
        </Card>
      </div>

      {/* Screen readers hear the result of each action without moving focus. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
