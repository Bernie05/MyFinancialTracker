import { Button } from "@mft/ui";
import { useEffect, useState } from "react";
import { api } from "../../api/endpoints";
import { Dialog } from "../../layout/Dialog";
import { PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { refreshAlerts } from "../../lib/alerts";
import { categoryColor } from "../../lib/categoryColor";
import { navigate, useSearch } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { usePeriod } from "../dashboard/period";
import { AddTransactionForm } from "../transactions/AddTransactionForm";
import { SectionDashboard } from "./SectionDashboard";
import { SectionTransactions } from "./SectionTransactions";

/**
 * Cash & Others: the same page as Online Credit and Credit Cards (header with its Add button, the shared
 * section dashboard, then the month's transactions), by category instead of by account, since cash has
 * no accounts, limits or due dates. ?add=1 opens the add dialog (the quick-add button uses it).
 */
export function CashSectionPage() {
  const period = usePeriod();
  const categories = useAsync(() => api.listCategories(), []);
  const [picked, setPicked] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const search = useSearch();
  useEffect(() => {
    if (new URLSearchParams(search).get("add") !== "1") return;
    setAdding(true);
    navigate(window.location.pathname, { replace: true });
  }, [search]);

  const changed = () => setVersion((v) => v + 1);

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/expenses", label: "Expenses" }}
        title="Cash & Others"
        subtitle="Paid in cash, by debit card or from an e-wallet balance"
        actions={
          <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
            Add expense
          </Button>
        }
      />

      <Loadable state={categories.state} reload={categories.reload} what="your categories" skeleton="bars">
        {(all) => {
          const sources = all
            .filter((c) => c.type === "expense" && c.parentId === null)
            .map((c) => ({ id: c.id, name: c.name, color: categoryColor(c.color) }));
          return (
            <>
              <SectionDashboard
                type="expense"
                noun="category"
                sources={sources}
                base={{ paidWith: "cash" }}
                filterFor={(id) => ({ categoryId: id })}
                picked={picked}
                onPick={setPicked}
                period={period}
                reloadKey={version}
              />

              <SectionTransactions
                type="expense"
                month={period.month}
                filters={{ paidWith: "cash", categoryId: picked ?? undefined }}
                cards={[]}
                allowCash
                emptyText="Add what you paid in cash, by debit card or from an e-wallet with Add expense."
                reloadKey={version}
                onChanged={changed}
              />
            </>
          );
        }}
      </Loadable>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add expense">
        {adding && (
          <AddTransactionForm
            type="expense"
            categories={categories.state.data ?? []}
            // Cash & Others adds cash and debit only; card charges are added on their account's page.
            cards={[]}
            onAdded={(message) => {
              setAdding(false);
              setAnnouncement(message);
              refreshAlerts();
              changed();
            }}
          />
        )}
      </Dialog>

      {/* Screen readers hear the result of each action without moving focus. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
