import { Amount, Button, Card, formatMoney, ProgressMeter, TextField } from "@mft/ui";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { refreshAlerts } from "../../lib/alerts";
import { categoryColor } from "../../lib/categoryColor";
import { todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";
import { navigate, useSearch } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { LimitSummary } from "../cards/CreditSummary";
import { money, PeriodTile, usePeriod } from "../dashboard/period";
import { AddTransactionForm } from "../transactions/AddTransactionForm";
import { SectionDashboard, type Source } from "./SectionDashboard";
import { SectionTransactions } from "./SectionTransactions";

type Budgets = Map<number, number>;

/** Budget − spent = left over the budgeted categories among `ids`, for one month. */
function budgetFigures(ids: number[], budgets: Budgets, spent: Map<number, number> | undefined) {
  const budgeted = ids.filter((id) => budgets.has(id));
  const limitMinor = budgeted.reduce((s, id) => s + budgets.get(id)!, 0);
  const spentMinor = budgeted.reduce((s, id) => s + (spent?.get(id) ?? 0), 0);
  const overMinor = budgeted.reduce((s, id) => s + Math.max(0, (spent?.get(id) ?? 0) - budgets.get(id)!), 0);
  const overCount = budgeted.filter((id) => (spent?.get(id) ?? 0) > budgets.get(id)!).length;
  return { count: budgeted.length, limitMinor, spentMinor, leftMinor: Math.max(0, limitMinor - spentMinor), overMinor, overCount };
}

/** Days of `month` still to come, today included: all of a future month, none of a past one. */
function daysLeft(month: string) {
  const today = todayLocal();
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(y, m, 0).getDate();
  const current = today.slice(0, 7);
  if (month < current) return 0;
  if (month > current) return days;
  return days - Number(today.slice(8, 10)) + 1;
}

/**
 * Cash & Others: the same page as Online Credit and Credit Cards, with cash's own data. A monthly budget
 * per category stands in for a credit limit (budget − spent = left), the Budgets list for the plans,
 * and category tiles for the account tiles. ?add=1 opens Add expense (the quick-add button uses it).
 */
export function CashSectionPage() {
  const period = usePeriod();
  const categories = useAsync(() => api.listCategories(), []);
  const budgetList = useAsync(() => api.listBudgets(), []);
  const [picked, setPicked] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const search = useSearch();
  useEffect(() => {
    if (new URLSearchParams(search).get("add") !== "1") return;
    setAdding(true);
    navigate(window.location.pathname, { replace: true });
  }, [search]);

  const changed = () => setVersion((v) => v + 1);
  const budgets: Budgets = new Map((budgetList.state.data ?? []).map((b) => [b.categoryId, b.limitMinor]));

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
          const sources: Source[] = all
            .filter((c) => c.type === "expense" && c.parentId === null)
            .map((c) => ({ id: c.id, name: c.name, color: categoryColor(c.color) }));
          const shown = picked === null ? sources : sources.filter((s) => s.id === picked);
          const ids = shown.map((s) => s.id);
          return (
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
              before={({ spent }) => <CategoryTiles sources={shown} budgets={budgets} spent={spent} onPick={setPicked} onEdit={setEditing} />}
              summary={({ spent }) => {
                const f = budgetFigures(ids, budgets, spent);
                return (
                  <LimitSummary
                    title={picked === null ? "Budget" : `${shown[0]?.name} budget`}
                    limit={{ label: "Monthly budget", minor: f.limitMinor, note: f.count === 0 ? "No budgets yet" : `${f.count} categor${f.count === 1 ? "y" : "ies"}` }}
                    used={{ label: "Spent", minor: f.spentMinor, note: `In budgeted categories · ${period.monthName}` }}
                    left={{ label: "Left to spend", minor: f.leftMinor, note: f.overMinor > 0 ? `${formatMoney(f.overMinor)} over budget` : "What you can still spend" }}
                    meterLabel="Budget used"
                  />
                );
              }}
              tiles={({ spent }) => {
                const f = budgetFigures(ids, budgets, spent);
                const days = daysLeft(period.month);
                return (
                  <>
                    <PeriodTile
                      label="Left to spend"
                      month={money(spent ? f.leftMinor : undefined)}
                      note={f.count === 0 ? "Set a budget on a category" : `Of ${formatMoney(f.limitMinor)} this month`}
                      yearLabel="A day"
                      year={days > 0 && f.count > 0 ? money(Math.floor(f.leftMinor / days), "sm") : "—"}
                    />
                    <PeriodTile
                      label="Over budget"
                      month={money(spent ? f.overMinor : undefined)}
                      note={f.overCount === 0 ? "Every category within budget" : `${f.overCount} categor${f.overCount === 1 ? "y" : "ies"} over`}
                      yearLabel="Budgeted"
                      year={String(f.count)}
                    />
                  </>
                );
              }}
              after={({ spent }) => (
                <>
                  <BudgetList sources={shown} budgets={budgets} spent={spent} month={period.monthName} onEdit={setEditing} />
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
              )}
            />
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

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Budget for ${editing.name}` : "Budget"}>
        {editing && (
          <BudgetForm
            source={editing}
            current={budgets.get(editing.id) ?? null}
            onSaved={(message) => {
              setEditing(null);
              setAnnouncement(message);
              budgetList.reload();
            }}
            onCancel={() => setEditing(null)}
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

/** Each budgeted category with how much of it is spent; the cash counterpart of Active loans. */
function BudgetList({ sources, budgets, spent, month, onEdit }: { sources: Source[]; budgets: Budgets; spent: Map<number, number> | undefined; month: string; onEdit: (s: Source) => void }) {
  const budgeted = sources.filter((s) => budgets.has(s.id));
  return (
    <Card title="Budgets" subtitle={`${month} · open one to change it`} padding="none" className="section-dash__list">
      {budgeted.length === 0 ? (
        <EmptyState heading="No budgets yet">Use Set budget on a category below to give it a monthly amount. It shows here with what's spent and what's left.</EmptyState>
      ) : (
        <ul className="loans">
          {budgeted.map((s) => {
            const limit = budgets.get(s.id)!;
            const used = spent?.get(s.id) ?? 0;
            const over = used > limit;
            return (
              <li key={s.id}>
                <button type="button" className="loan budget-row" onClick={() => onEdit(s)}>
                  <span className="loan__head">
                    <span className="loan__name">
                      <ColorDot color={s.color} /> {s.name}
                    </span>
                    <span className="loan__meta">{formatMoney(limit)} a month</span>
                  </span>
                  <span className="loan__figures">
                    <span>
                      <span className="loan__label">Budget</span>
                      <Amount minorUnits={limit} size="md" tone="neutral" />
                    </span>
                    <span>
                      <span className="loan__label">Spent</span>
                      <Amount minorUnits={used} size="md" tone="neutral" />
                    </span>
                    <span>
                      <span className="loan__label">{over ? "Over by" : "Left"}</span>
                      <Amount minorUnits={Math.abs(limit - used)} size="md" tone={over ? "expense" : "neutral"} />
                    </span>
                  </span>
                  <ProgressMeter
                    className="loan__progress"
                    kind="budget"
                    warnAt={0.8}
                    label={`${Math.round((used / limit) * 100)}% used`}
                    value={used}
                    max={limit}
                    valueText={`${formatMoney(used)} of ${formatMoney(limit)}`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Every category as a tile, like the account tiles: pick it, or set its budget. */
function CategoryTiles({ sources, budgets, spent, onPick, onEdit }: { sources: Source[]; budgets: Budgets; spent: Map<number, number> | undefined; onPick: (id: number) => void; onEdit: (s: Source) => void }) {
  return (
    <>
      <h2 className="salary__section-title loans__accounts-title">Categories</h2>
      <ul className="loan-accounts">
        {sources.map((s) => {
          const limit = budgets.get(s.id);
          const used = spent?.get(s.id) ?? 0;
          return (
            <li key={s.id} className="loan-account__item">
              <button type="button" className="loan-account" onClick={() => onPick(s.id)}>
                <ColorDot color={s.color} />
                <span className="loan-account__name">{s.name}</span>
                <span className="loan-account__owed">
                  {limit === undefined ? `No budget · ${formatMoney(used)} spent` : `${formatMoney(Math.max(0, limit - used))} left of ${formatMoney(limit)} · ${formatMoney(used)} spent`}
                </span>
              </button>
              <Button variant="ghost" size="sm" className="loan-account__delete" onClick={() => onEdit(s)} aria-label={`${limit === undefined ? "Set" : "Edit"} budget for ${s.name}`}>
                {limit === undefined ? "Set budget" : "Edit budget"}
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** A category's monthly budget: set, change or remove it. */
function BudgetForm({ source, current, onSaved, onCancel }: { source: Source; current: number | null; onSaved: (message: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(current === null ? "" : (current / 100).toFixed(2));
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(limitMinor: number | null) {
    setBusy(true);
    setError(undefined);
    try {
      await api.setBudget(source.id, limitMinor);
      onSaved(limitMinor === null ? `${source.name} budget removed` : `${source.name} budget set to ${formatMoney(limitMinor)} a month`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.limitMinor ?? err.message) : "Couldn't save the budget. Try again.");
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const minor = parseAmountToMinor(amount);
    if (minor === null || minor <= 0) return setError("Enter an amount above ₱0.");
    void save(minor);
  }

  return (
    <form className="cat-editor" onSubmit={submit} noValidate>
      <TextField
        label="Monthly budget"
        hint={`What you plan to spend on ${source.name} each month in cash, debit or e-wallet. It applies to every month until you change it.`}
        inputMode="decimal"
        prefix="₱"
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error}
      />
      <div className="dialog__actions">
        {current !== null && (
          <Button type="button" variant="ghost" className="dialog__left" onClick={() => save(null)} disabled={busy}>
            Remove budget
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Save budget
        </Button>
      </div>
    </form>
  );
}
