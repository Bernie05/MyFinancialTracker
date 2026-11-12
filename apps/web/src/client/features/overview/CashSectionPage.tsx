import { Amount, Button, Card, formatMoney, ProgressMeter, Select, TextField } from "@mft/ui";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { PlusIcon, TrashIcon } from "../../layout/icons";
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

/**
 * Budget − spent = left for one month. With a main monthly budget (`total`), it is the limit and every
 * category's spending counts against it; without one, the budgeted categories among `ids` are summed.
 */
function budgetFigures(ids: number[], budgets: Budgets, spent: Map<number, number> | undefined, total: number | null = null) {
  const budgeted = ids.filter((id) => budgets.has(id));
  const overCount = budgeted.filter((id) => (spent?.get(id) ?? 0) > budgets.get(id)!).length;
  if (total !== null) {
    const spentMinor = ids.reduce((s, id) => s + (spent?.get(id) ?? 0), 0);
    return { main: true, count: budgeted.length, limitMinor: total, spentMinor, leftMinor: Math.max(0, total - spentMinor), overMinor: Math.max(0, spentMinor - total), overCount };
  }
  const limitMinor = budgeted.reduce((s, id) => s + budgets.get(id)!, 0);
  const spentMinor = budgeted.reduce((s, id) => s + (spent?.get(id) ?? 0), 0);
  const overMinor = budgeted.reduce((s, id) => s + Math.max(0, (spent?.get(id) ?? 0) - budgets.get(id)!), 0);
  return { main: false, count: budgeted.length, limitMinor, spentMinor, leftMinor: Math.max(0, limitMinor - spentMinor), overMinor, overCount };
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
  const mainBudget = useAsync(() => api.getMonthlyBudget(), []);
  const cardList = useAsync(() => api.listCashCards(), []);
  const [picked, setPicked] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  /** Every category's budget in one form, opened from the Monthly budget summary. */
  const [editingAll, setEditingAll] = useState(false);
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
  const mainLimit = mainBudget.state.data?.limitMinor ?? null;

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
          // The cards are a pick of categories (in the order they were added); the dashboard still covers all of them.
          const bySource = new Map(sources.map((s) => [s.id, s]));
          const cardSources = (cardList.state.data ?? []).map((c) => bySource.get(c.categoryId)).filter((s): s is Source => s !== undefined);
          const shownCards = picked === null ? cardSources : cardSources.filter((s) => s.id === picked);
          // The main budget covers "All categories"; one picked category uses its own budget.
          const total = picked === null ? mainLimit : null;
          return (
            <>
            <Dialog open={editingAll} onClose={() => setEditingAll(false)} title="Monthly budget">
              {editingAll && (
                <AllBudgetsForm
                  cards={cardSources}
                  available={sources}
                  budgets={budgets}
                  main={mainLimit}
                  onSaved={(message) => {
                    setEditingAll(false);
                    setAnnouncement(message);
                    budgetList.reload();
                    mainBudget.reload();
                    cardList.reload();
                  }}
                  onCancel={() => setEditingAll(false)}
                />
              )}
            </Dialog>
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
              before={({ spent }) => <CategoryTiles sources={shownCards} hasCards={cardSources.length > 0} budgets={budgets} spent={spent} onAdd={() => setEditingAll(true)} />}
              summary={({ spent }) => {
                const f = budgetFigures(ids, budgets, spent, total);
                const allocated = [...budgets.values()].reduce((s, v) => s + v, 0);
                return (
                  <LimitSummary
                    title={picked === null ? "Budget" : `${shown[0]?.name} budget`}
                    limit={{
                      label: "Monthly budget",
                      minor: f.limitMinor,
                      note: f.main
                        ? `Main budget · ${formatMoney(allocated)} in category budgets`
                        : f.count === 0
                          ? "No budgets yet"
                          : `${f.count} categor${f.count === 1 ? "y" : "ies"}`,
                    }}
                    used={{ label: "Spent", minor: f.spentMinor, note: `${f.main ? "All categories" : "In budgeted categories"} · ${period.monthName}` }}
                    left={{ label: "Left to spend", minor: f.leftMinor, note: f.overMinor > 0 ? `${formatMoney(f.overMinor)} over budget` : "What you can still spend" }}
                    meterLabel="Budget used"
                  >
                    <div className="credit-sum__actions">
                      <Button size="sm" variant="secondary" onClick={() => setEditingAll(true)}>
                        {budgets.size === 0 && mainLimit === null ? "Set monthly budget" : "Edit monthly budget"}
                      </Button>
                    </div>
                  </LimitSummary>
                );
              }}
              tiles={({ spent }) => {
                const f = budgetFigures(ids, budgets, spent, total);
                const days = daysLeft(period.month);
                const hasBudget = f.main || f.count > 0;
                return (
                  <>
                    <PeriodTile
                      label="Left to spend"
                      month={money(spent ? f.leftMinor : undefined)}
                      note={hasBudget ? `Of ${formatMoney(f.limitMinor)} this month` : "Set a monthly budget"}
                      yearLabel="A day"
                      year={days > 0 && hasBudget ? money(Math.floor(f.leftMinor / days), "sm") : "—"}
                    />
                    <PeriodTile
                      label="Over budget"
                      month={money(spent ? f.overMinor : undefined)}
                      note={
                        f.main && f.overMinor > 0
                          ? `Over the main budget${f.overCount > 0 ? ` · ${f.overCount} categor${f.overCount === 1 ? "y" : "ies"} over` : ""}`
                          : f.overCount === 0
                            ? "Every category within budget"
                            : `${f.overCount} categor${f.overCount === 1 ? "y" : "ies"} over`
                      }
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

/**
 * The picked category cards, read-only: what each spent this month and its limit. Cards are added,
 * removed and budgeted in the Monthly budget dialog; removing a card never deletes the category.
 */
function CategoryTiles({ sources, hasCards, budgets, spent, onAdd }: { sources: Source[]; hasCards: boolean; budgets: Budgets; spent: Map<number, number> | undefined; onAdd: () => void }) {
  return (
    <>
      <div className="cat-cards__head">
        <h2 className="salary__section-title loans__accounts-title">Categories</h2>
        {hasCards && (
          <Button variant="ghost" size="sm" iconStart={<PlusIcon />} onClick={onAdd}>
            Add card
          </Button>
        )}
      </div>
      {!hasCards && (
        <div className="loan-accounts__empty">
          <EmptyState
            heading="No category cards yet"
            action={
              <Button iconStart={<PlusIcon />} onClick={onAdd}>
                Add card
              </Button>
            }
          >
            Pick the categories you want to watch here, with their monthly limit.
          </EmptyState>
        </div>
      )}
      <ul className="loan-accounts">
        {sources.map((s) => {
          const limit = budgets.get(s.id);
          const used = spent?.get(s.id) ?? 0;
          const over = limit !== undefined && used > limit;
          return (
            <li key={s.id} className="loan-account__item">
              <div className="loan-account loan-account--static">
                <ColorDot color={s.color} />
                <span className="loan-account__name">{s.name}</span>
                <dl className="cat-limit">
                  <div className="cat-limit__row">
                    <dt>Expenses:</dt>
                    <dd className={over ? "cat-limit__over" : undefined}>
                      {spent ? formatMoney(used) : "…"}
                      {over && <span className="visually-hidden"> (over the limit by {formatMoney(used - limit)})</span>}
                    </dd>
                  </div>
                  <div className="cat-limit__row">
                    <dt>Limit:</dt>
                    <dd>{limit === undefined ? "None" : formatMoney(limit)}</dd>
                  </div>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One box's text read as minor units: null = empty (no budget), NaN = not a valid amount. */
function readAmount(text: string | undefined): number | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const minor = parseAmountToMinor(t);
  return minor === null || minor <= 0 ? Number.NaN : minor;
}
const pesoText = (minor: number | null | undefined) => (minor == null ? "" : (minor / 100).toFixed(2));
const MAIN = "main";

/**
 * The monthly budget in one form: the main amount for all of Cash & Others (e.g. ₱20,000) on top,
 * then the category cards with each one's share. Add a card by picking a category; the bin removes
 * the card only (and its budget), never the category. Nothing is saved until Save; only what changed is sent.
 */
function AllBudgetsForm({ cards, available, budgets, main, onSaved, onCancel }: {
  /** The cards as saved, in order. */
  cards: Source[];
  /** Every top-level expense category, to add as a card. */
  available: Source[];
  budgets: Budgets;
  main: number | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [mainText, setMainText] = useState(pesoText(main));
  const [list, setList] = useState<Source[]>(cards);
  const [amounts, setAmounts] = useState<Record<number, string>>(() => Object.fromEntries(cards.map((s) => [s.id, pesoText(budgets.get(s.id))])));
  const [toAdd, setToAdd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const valid = (v: number | null): v is number => v !== null && !Number.isNaN(v);
  const mainValue = readAmount(mainText);
  const allocated = list.reduce((sum, s) => {
    const v = readAmount(amounts[s.id]);
    return valid(v) ? sum + v : sum;
  }, 0);
  const budgetedCount = list.filter((s) => valid(readAmount(amounts[s.id]))).length;
  const addable = available.filter((s) => !list.some((c) => c.id === s.id));
  const chosenAdd = addable.some((s) => String(s.id) === toAdd) ? toAdd : (addable[0] ? String(addable[0].id) : "");

  function addCard() {
    const source = addable.find((s) => String(s.id) === chosenAdd);
    if (!source) return;
    setList((l) => [...l, source]);
    setAmounts((a) => ({ ...a, [source.id]: pesoText(budgets.get(source.id)) }));
    setToAdd("");
  }

  function removeCard(id: number) {
    setList((l) => l.filter((s) => s.id !== id));
    setErrors(({ [String(id)]: _, ...rest }) => rest);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (Number.isNaN(mainValue)) bad[MAIN] = "Enter an amount above ₱0, or leave it empty.";
    for (const s of list) if (Number.isNaN(readAmount(amounts[s.id]))) bad[s.id] = "Enter an amount above ₱0, or leave it empty.";
    setErrors(bad);
    setFormError(undefined);
    if (Object.keys(bad).length > 0) return;

    const mainChanged = mainValue !== main;
    const removed = cards.filter((c) => !list.some((s) => s.id === c.id));
    const added = list.filter((s) => !cards.some((c) => c.id === s.id));
    const changes = list.filter((s) => readAmount(amounts[s.id]) !== (budgets.get(s.id) ?? null));
    if (!mainChanged && removed.length === 0 && added.length === 0 && changes.length === 0) return onCancel();

    setBusy(true);
    try {
      if (mainChanged) await api.setMonthlyBudget(mainValue);
      // Removing a card also clears its budget on the server.
      for (const s of removed) await api.removeCashCard(s.id);
      for (const s of added) await api.addCashCard(s.id);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      setBusy(false);
      return;
    }
    let saved = 0;
    for (const s of changes) {
      try {
        await api.setBudget(s.id, readAmount(amounts[s.id]));
        saved++;
      } catch (err) {
        setErrors({ [s.id]: err instanceof ApiError ? (err.fields.limitMinor ?? err.message) : "Couldn't save this one. Try again." });
        setFormError(`Saved ${saved} of ${changes.length} category budgets. Fix the one marked and save again.`);
        setBusy(false);
        return;
      }
    }
    const parts = [
      mainChanged && (mainValue === null ? "Main budget removed" : `Main budget set to ${formatMoney(mainValue)}`),
      added.length > 0 && `${added.length} card${added.length === 1 ? "" : "s"} added`,
      removed.length > 0 && `${removed.length} card${removed.length === 1 ? "" : "s"} removed`,
      saved > 0 && `${saved} budget${saved === 1 ? "" : "s"} updated`,
    ];
    onSaved(parts.filter(Boolean).join(" · "));
  }

  return (
    <form className="cat-editor all-budgets" onSubmit={submit} noValidate>
      <div className="all-budgets__row all-budgets__row--main">
        <TextField
          label="Main monthly budget"
          hint="All of Cash & Others in a month, e.g. ₱20,000. Every category's spending counts against it. Leave it empty for none."
          inputMode="decimal"
          prefix="₱"
          placeholder="No main budget"
          autoFocus
          value={mainText}
          onChange={(e) => setMainText(e.target.value)}
          error={errors[MAIN]}
        />
      </div>

      <div>
        <h3 className="all-budgets__heading">Category cards</h3>
        <p className="all-budgets__intro">Pick the categories shown as cards, each with an optional budget. The bin removes the card only; the category and its expenses stay.</p>
      </div>

      {list.length === 0 ? (
        <p className="all-budgets__empty">No cards yet. Add a category below.</p>
      ) : (
        <ul className="all-budgets__rows" aria-label="Category cards">
          {list.map((s) => (
            <li key={s.id} className="all-budgets__row all-budgets__row--cat">
              <ColorDot color={s.color} />
              <TextField
                label={s.name}
                inputMode="decimal"
                prefix="₱"
                placeholder="No budget"
                value={amounts[s.id] ?? ""}
                onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))}
                error={errors[s.id]}
              />
              <button
                type="button"
                className="icon-button icon-button--sm all-budgets__remove"
                aria-label={`Remove ${s.name} card`}
                title="Remove card (keeps the category)"
                onClick={() => removeCard(s.id)}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="all-budgets__add">
        {addable.length > 0 ? (
          <>
            <Select label="Add a category card" value={chosenAdd} onChange={(e) => setToAdd(e.target.value)} options={addable.map((s) => ({ value: String(s.id), label: s.name }))} />
            <Button type="button" variant="secondary" iconStart={<PlusIcon />} onClick={addCard}>
              Add
            </Button>
          </>
        ) : (
          <p className="all-budgets__intro">Every expense category has a card. New categories are made on the Categories page.</p>
        )}
      </div>

      <div className="all-budgets__total" aria-live="polite">
        <span>
          <span className="all-budgets__total-label">Monthly budget</span>
          <strong>{formatMoney(valid(mainValue) ? mainValue : allocated)}</strong>
        </span>
        <span className={`all-budgets__count${valid(mainValue) && allocated > mainValue ? " all-budgets__count--over" : ""}`}>
          {valid(mainValue)
            ? allocated > mainValue
              ? `Cards add up to ${formatMoney(allocated)}: ${formatMoney(allocated - mainValue)} more than the main budget`
              : `${formatMoney(allocated)} in ${budgetedCount} card${budgetedCount === 1 ? "" : "s"} · ${formatMoney(mainValue - allocated)} not assigned`
            : `Sum of ${budgetedCount} of ${list.length} card${list.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {formError && (
        <p className="all-budgets__error" role="alert">
          {formError}
        </p>
      )}
      <div className="dialog__actions">
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
