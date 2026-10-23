import { Amount, Button, Card, SegmentedControl, TextField } from "@mft/ui";
import { useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { MAX_PAGE_SIZE, type Transaction, type TransactionType } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { EmptyState } from "../../layout/EmptyState";
import { Loadable } from "../../layout/Loadable";
import { startAddTransaction } from "../../layout/quickAdd";
import { dayLabel, presetRange, rangeLabel } from "../../lib/dates";
import { linkClick, navigate, useSearch } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { TransactionList } from "../transactions/TransactionList";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
] as const;
type Period = (typeof PERIODS)[number]["value"];
const TYPES = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
] as const;
const EMPTY: Record<Period, string> = { today: "No transactions today", week: "No transactions this week", month: "No transactions this month", custom: "No transactions in these dates" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The panel's period and type live in the URL (?recent=week&rtype=expense), like the ledger filters. */
function useRecentParams() {
  const params = new URLSearchParams(useSearch());
  const p = params.get("recent");
  const period: Period = PERIODS.some((o) => o.value === p) ? (p as Period) : "month";
  const t = params.get("rtype");
  const type: TransactionType | undefined = t === "expense" || t === "income" ? t : undefined;
  const date = (key: string) => (DATE.test(params.get(key) ?? "") ? params.get(key)! : undefined);
  const range = period === "custom" ? { from: date("rfrom"), to: date("rto") } : presetRange(period);
  return { period, type, ...range };
}

function setParams(changes: Record<string, string | undefined>) {
  const next = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
  const qs = next.toString();
  navigate(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
}

/** The same dates on a ledger page: its own presets cover today/week/month, custom carries from/to. */
function ledgerLink(path: string, period: Period, from?: string, to?: string) {
  const q = new URLSearchParams(period === "custom" ? { range: "custom", ...(from && { from }), ...(to && { to }) } : period === "month" ? {} : { range: period });
  return `${path}${q.size ? `?${q}` : ""}`;
}

interface RecentTransactionsProps {
  /** Bumped by the Dashboard after any edit or delete, to refetch. */
  refresh: number;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => Promise<void>;
}

/** Recent transactions for a period, grouped by day, in a scroll area of bounded height. */
export function RecentTransactions(props: RecentTransactionsProps) {
  const { period, type, from, to } = useRecentParams();
  const invalid = !!from && !!to && from > to;
  const links = (
    <span className="card-links">
      View all in{" "}
      {type !== "income" && (
        <a href={ledgerLink("/expenses", period, from, to)} onClick={linkClick}>
          Expenses
        </a>
      )}
      {!type && " or "}
      {type !== "expense" && (
        <a href={ledgerLink("/income", period, from, to)} onClick={linkClick}>
          Income
        </a>
      )}
    </span>
  );

  return (
    <Card
      title="Recent transactions"
      subtitle={rangeLabel(from, to)}
      padding="none"
      className="recent"
      action={
        <SegmentedControl
          aria-label="Period"
          size="sm"
          options={PERIODS}
          value={period}
          // Custom starts from the dates on screen, so nothing jumps.
          onChange={(value) => setParams(value === "custom" ? { recent: value, rfrom: from, rto: to } : { recent: value === "month" ? undefined : value, rfrom: undefined, rto: undefined })}
        />
      }
    >
      <div className="recent__bar">
        <SegmentedControl
          aria-label="Type"
          size="sm"
          options={TYPES}
          value={type ?? "all"}
          onChange={(value) => setParams({ rtype: value === "all" ? undefined : value })}
        />
        {/* Always shown with the period's dates (labels inside the field), so picking Custom moves nothing.
            Editing a date switches to Custom, keeping the other date. */}
        <div className="recent__dates">
          <TextField label="From" prefix="From" type="date" value={from ?? ""} max={to} aria-invalid={invalid || undefined} onChange={(e) => setParams({ recent: "custom", rfrom: e.target.value, rto: to })} />
          <TextField label="To" prefix="To" type="date" value={to ?? ""} min={from} aria-invalid={invalid || undefined} onChange={(e) => setParams({ recent: "custom", rfrom: from, rto: e.target.value })} />
        </div>
      </div>
      {invalid && <p className="recent__error" role="alert">The end date is before the start date.</p>}
      {/* Not keyed by the query: switching period keeps the old rows (dimmed) until the new ones arrive. */}
      {!invalid && <RecentList {...props} from={from} to={to} type={type} empty={EMPTY[period]} label={rangeLabel(from, to)} />}
      {!invalid && <footer className="recent__footer">{links}</footer>}
    </Card>
  );
}

type ListProps = RecentTransactionsProps & { from?: string; to?: string; type?: TransactionType; empty: string; label: string };

function RecentList({ from, to, type, empty, label, refresh, onEdit, onDelete }: ListProps) {
  const query = `${from}|${to}|${type}`;
  // ponytail: the latest 100 rows (one page); past that the footer says so and the ledger has the rest. Add paging on scroll if 100 feels short.
  const page = useAsync(
    (signal) => api.listTransactions({ from, to, type, pageSize: MAX_PAGE_SIZE }, signal).then((pg) => ({ ...pg, query, empty, label })),
    [query, refresh],
  );
  const busy = page.state.status === "loading";
  const scroller = useRef<HTMLDivElement>(null);
  const shownQuery = useRef<string | undefined>(undefined);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const measure = (el: HTMLElement) =>
    setEdges({ top: el.scrollTop > 2, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 2 });

  // New period: back to the top. Same period refetched after an edit: keep the scroll position.
  useLayoutEffect(() => {
    const el = scroller.current;
    const data = page.state.data;
    if (!el || !data) return;
    if (data.query !== shownQuery.current) el.scrollTop = 0;
    shownQuery.current = data.query;
    measure(el);
  }, [page.state.data]);

  return (
    <Loadable state={page.state} reload={page.reload} what="transactions">
      {({ items, days, total, empty: emptyText, label: shownLabel }) =>
        total === 0 ? (
          <div className="recent__body" aria-busy={busy}>
            <EmptyState heading={emptyText} action={<Button variant="secondary" size="sm" onClick={startAddTransaction}>Add transaction</Button>}>
              Pick another period, or add one.
            </EmptyState>
          </div>
        ) : (
          <div className={`recent__body${edges.top ? " recent__body--above" : ""}${edges.bottom ? " recent__body--below" : ""}`} aria-busy={busy}>
            <div
              ref={scroller}
              className="recent__scroll"
              tabIndex={0}
              role="region"
              aria-label={`Transactions, ${shownLabel}`}
              onScroll={(e: UIEvent<HTMLDivElement>) => measure(e.currentTarget)}
            >
              {days.map((day) => (
                <section key={day.date} className="day-group" aria-labelledby={`day-${day.date}`}>
                  <h3 className="day-group__head" id={`day-${day.date}`}>
                    <span>{dayLabel(day.date)}</span>
                    <span className="day-group__sum">
                      {day.count} {day.count === 1 ? "transaction" : "transactions"} ·{" "}
                      <Amount minorUnits={day.incomeMinor - day.expenseMinor} size="sm" />
                    </span>
                  </h3>
                  <TransactionList transactions={items.filter((t) => t.occurredOn === day.date)} onEdit={onEdit} onDelete={onDelete} />
                </section>
              ))}
              {items.length < total && (
                <p className="recent__cap">
                  Showing the latest {items.length} of {total}. The ledger has the rest.
                </p>
              )}
            </div>
          </div>
        )
      }
    </Loadable>
  );
}
