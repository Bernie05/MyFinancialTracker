import { Card, formatMoney, Select } from "@mft/ui";
import type { ReactNode } from "react";
import type { CardSummary, MonthlyFilters, MonthTotals, TransactionType } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { Loadable } from "../../layout/Loadable";
import { monthLabel, shortMonth } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { CreditSummary } from "../cards/CreditSummary";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { money, PeriodPicker, PeriodTile, trend, type Period } from "../dashboard/period";

/** One thing the section can be narrowed to: an account (SpayLater, BPI Gold) or a category (Rent, Food). */
export interface Source {
  id: number;
  name: string;
  /** Any CSS color. */
  color: string;
  archived?: boolean;
}

export interface SectionDashboardProps {
  type: TransactionType;
  /** What a source is called: "account" or "category". */
  noun: "account" | "category";
  sources: Source[];
  /** The section's own scope: online credit, bank cards, cash, everything but salary… */
  base: MonthlyFilters;
  /** Narrows the scope to one source. */
  filterFor: (id: number) => MonthlyFilters;
  /** The picked source; null = all of them. */
  picked: number | null;
  onPick: (id: number | null) => void;
  period: Period;
  /** Credit accounts in this section: shows limit − used = available for the pick. */
  credit?: CardSummary[];
  /** The section's own figures after the month total (due now, still to bill…); built for the pick. */
  tiles?: ReactNode | ((ctx: SectionContext) => ReactNode);
  /** In place of the credit summary: the section's own (Cash & Others: budget − spent = left). */
  summary?: (ctx: SectionContext) => ReactNode;
  /** Page parts above the dashboard that need its figures (Cash & Others: category tiles). */
  before?: (ctx: SectionContext) => ReactNode;
  /** The page parts under the dashboard that need its figures (Cash & Others: budgets, transactions). */
  after?: (ctx: SectionContext) => ReactNode;
  /** Bump to refetch after something in the section was added, edited or deleted. */
  reloadKey?: number;
}

/** What the dashboard already loaded, for the page's own parts. */
export interface SectionContext {
  /** Each source's total in the picked month; undefined while loading. */
  spent: Map<number, number> | undefined;
}

const amountOf = (type: TransactionType, r: MonthTotals | undefined) => (r ? (type === "expense" ? r.expenseMinor : r.incomeMinor) : 0);

/**
 * The one dashboard every section shares (Online Credit, Credit Cards, Cash & Others, Other Income).
 * Pick "All accounts" or one of them, and a month: the credit summary, the tiles, the chart and the
 * breakdown all follow, so it works the same with one account or ten.
 */
export function SectionDashboard({ type, noun, sources, base, filterFor, picked, onPick, period, credit, tiles, summary, before, after, reloadKey = 0 }: SectionDashboardProps) {
  const { year, month, prevMonth, monthName, yearLabel } = period;
  const to = `${year}-12`;
  const plural = noun === "account" ? "accounts" : "categories";
  const verb = type === "expense" ? "Spent" : "Received";
  const key = sources.map((s) => s.id).join(",");

  // The section total and each source, for the picked year plus last December (January's trend).
  const data = useAsync(async () => {
    const [total, ...each] = await Promise.all([
      api.getMonthly(to, 13, base),
      ...sources.map((s) => api.getMonthly(to, 13, { ...base, ...filterFor(s.id) })),
    ]);
    return { total, each: new Map(sources.map((s, i) => [s.id, each[i]!])) };
  }, [to, key, JSON.stringify(base), reloadKey]);

  const pickedSource = sources.find((s) => s.id === picked) ?? null;
  const rows = data.state.data ? (pickedSource ? data.state.data.each.get(pickedSource.id) : data.state.data.total) : undefined;
  const at = (m: string) => (rows ? amountOf(type, rows.find((r) => r.month === m)) : undefined);
  const inYear = rows?.filter((r) => r.month.startsWith(`${year}-`));
  const thisMonth = at(month);
  const yearTotal = inYear?.reduce((sum, r) => sum + amountOf(type, r), 0);
  // The average runs from the first month with anything in it to the picked month, so empty months before don't drag it down.
  const upTo = inYear?.filter((r) => r.month <= month);
  const first = upTo?.findIndex((r) => amountOf(type, r) > 0) ?? -1;
  const counted = upTo ? (first < 0 ? [] : upTo.slice(first)) : undefined;
  const highest = inYear?.reduce<MonthTotals | undefined>((best, r) => (!best || amountOf(type, r) > amountOf(type, best) ? r : best), undefined);

  const options = [{ value: "all", label: `All ${plural}` }, ...sources.map((s) => ({ value: String(s.id), label: s.archived ? `${s.name} (archived)` : s.name }))];
  const breakdown = data.state.data
    ? sources
        .map((s) => {
          const r = data.state.data!.each.get(s.id)!;
          return { source: s, month: amountOf(type, r.find((x) => x.month === month)), year: r.filter((x) => x.month.startsWith(`${year}-`)).reduce((sum, x) => sum + amountOf(type, x), 0) };
        })
        .sort((a, b) => b.month - a.month || b.year - a.year)
    : undefined;
  const ctx: SectionContext = { spent: breakdown && new Map(breakdown.map((b) => [b.source.id, b.month])) };
  const monthSum = breakdown?.reduce((sum, b) => sum + b.month, 0) ?? 0;

  return (
    <>
      {before?.(ctx)}
      <div className="section-dash__bar">
        <Select
          label={noun === "account" ? "Account" : "Category"}
          options={options}
          value={picked === null ? "all" : String(picked)}
          onChange={(e) => onPick(e.target.value === "all" ? null : Number(e.target.value))}
        />
        <PeriodPicker period={period} />
      </div>

      {summary?.(ctx)}
      {credit && <CreditSummary cards={pickedSource ? credit.filter((c) => c.id === pickedSource.id) : credit} title={pickedSource?.name ?? "Credit"} />}

      <section className="kpis" aria-label={`${pickedSource?.name ?? `All ${plural}`}, ${monthName}`}>
        <PeriodTile
          label={`${verb} · ${monthName}`}
          tone="accent"
          month={money(thisMonth)}
          trend={thisMonth !== undefined ? trend(thisMonth, at(prevMonth), prevMonth, type === "income") : undefined}
          note={pickedSource?.name ?? `All ${plural}`}
          yearLabel={yearLabel}
          year={money(yearTotal, "sm")}
        />
        {(typeof tiles === "function" ? tiles(ctx) : tiles) ?? (
          <>
            <PeriodTile
              label="Monthly average"
              month={money(counted ? (counted.length ? Math.round(counted.reduce((s, r) => s + amountOf(type, r), 0) / counted.length) : 0) : undefined)}
              note={counted?.length ? `${monthLabel(counted[0]!.month).split(" ")[0]} to ${monthName}` : "No months yet"}
              yearLabel="Months counted"
              year={counted ? String(counted.length) : "…"}
            />
            <PeriodTile
              label={`Highest month · ${year}`}
              month={highest ? <span className="mft-stat__value mft-amount--lg">{amountOf(type, highest) > 0 ? monthLabel(highest.month).split(" ")[0] : "—"}</span> : money(undefined)}
              note={highest && amountOf(type, highest) > 0 ? formatMoney(amountOf(type, highest)) : "Nothing yet"}
              yearLabel={yearLabel}
              year={money(yearTotal, "sm")}
            />
            <PeriodTile
              label={`Top ${noun} · ${monthName}`}
              month={breakdown ? <span className="mft-stat__value mft-amount--lg">{breakdown[0] && breakdown[0].month > 0 ? breakdown[0].source.name : "—"}</span> : money(undefined)}
              note={breakdown?.[0] && breakdown[0].month > 0 ? formatMoney(breakdown[0].month) : `Nothing in ${monthName} yet`}
              yearLabel={`${plural[0]!.toUpperCase()}${plural.slice(1)}`}
              year={String(sources.length)}
            />
          </>
        )}
      </section>

      <div className="dash-layout section-dash__layout">
        <Card title={`${verb} by month`} subtitle={`${pickedSource?.name ?? `All ${plural}`} · ${year}`} className="overview__chart">
          <Loadable state={data.state} reload={data.reload} what="the chart" skeleton="chart">
            {() => (
              <MonthlyBarChart
                series={[{ name: pickedSource?.name ?? verb, color: pickedSource?.color ?? (type === "expense" ? "var(--chart-expense)" : "var(--chart-income)") }]}
                tableToggle
                description={`${verb} per month in ${year}${pickedSource ? ` on ${pickedSource.name}` : ""}.`}
                data={(inYear ?? []).map((r) => ({ label: shortMonth(r.month), values: [amountOf(type, r)] }))}
              />
            )}
          </Loadable>
        </Card>

        <Card title={`By ${noun}`} subtitle={monthLabel(month)} className="dash-fixed">
          <div className="dash-fixed__scroll" tabIndex={0} role="region" aria-label={`${verb} by ${noun}`}>
            <Loadable state={data.state} reload={data.reload} what={`the ${plural}`} skeleton="bars">
              {() => (
                <ul className="section-dash__sources">
                  {breakdown!.map(({ source, month: m, year: y }) => (
                    <li key={source.id}>
                      <button
                        type="button"
                        className={`section-dash__source${source.id === picked ? " section-dash__source--on" : ""}`}
                        aria-pressed={source.id === picked}
                        onClick={() => onPick(source.id === picked ? null : source.id)}
                      >
                        <span className="section-dash__name">
                          <ColorDot color={source.color} /> {source.name}
                        </span>
                        <span className="section-dash__amount">{formatMoney(m)}</span>
                        <span className="section-dash__meter" aria-hidden="true">
                          <span style={{ width: `${monthSum > 0 ? Math.round((m / monthSum) * 100) : 0}%`, background: source.color }} />
                        </span>
                        <span className="section-dash__year">
                          {yearLabel} {formatMoney(y)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Loadable>
          </div>
        </Card>
      </div>
      {after?.(ctx)}
    </>
  );
}
