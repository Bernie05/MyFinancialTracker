import { Amount, Button, Card, formatMoney, SegmentedControl } from "@mft/ui";
import { useState } from "react";
import type { Month, MonthTotals, Transaction } from "../../../shared/contracts";
import { api } from "../../api/endpoints";
import { AlertBanner } from "../../layout/AlertBanner";
import { EmptyState } from "../../layout/EmptyState";
import { EditTransactionDialog } from "../transactions/EditTransactionDialog";
import { RecentTransactions } from "./RecentTransactions";
import { UpcomingDues } from "./UpcomingDues";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { refreshAlerts } from "../../lib/alerts";
import { monthLabel, shortMonth } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { CategoryBars } from "../charts/CategoryBars";
import { ChartTable, MonthlyBarChart } from "../charts/MonthlyBarChart";
import { loadingFigure, money, pad, PeriodPicker, PeriodTile, trend, usePeriod } from "./period";

const incomeVsExpense = [
  { name: "Income", color: "var(--chart-income)" },
  { name: "Expenses", color: "var(--chart-expense)" },
];

const CHART_VIEWS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;
type ChartView = (typeof CHART_VIEWS)[number]["value"];

const CHART_DISPLAYS = [
  { value: "chart", label: "Chart" },
  { value: "table", label: "Table" },
] as const;
type ChartDisplay = (typeof CHART_DISPLAYS)[number]["value"];
/** How many years the yearly view shows, ending with the selected one. */
const YEARS_SHOWN = 5;

const SPEND_SCOPES = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;
type SpendScope = (typeof SPEND_SCOPES)[number]["value"];

/** Saved ÷ earned, as a whole percent; null with no income (a rate of nothing means nothing). */
const rate = (t: { incomeMinor: number; netMinor: number } | undefined) =>
  t && t.incomeMinor > 0 ? Math.round((t.netMinor / t.incomeMinor) * 100) : null;
const rateTone = (r: number | null) => (r === null || r === 0 ? "neutral" : r > 0 ? "good" : "bad");
const rateText = (r: number | null) => (r === null ? "—" : `${r}%`);

/** The months of the quarter that holds `month`: Q4 for November is October to December. */
function quarterOf(month: Month): { from: Month; to: Month; label: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const q = Math.floor((m - 1) / 3);
  return { from: `${y}-${pad(q * 3 + 1)}`, to: `${y}-${pad(q * 3 + 3)}`, label: `Q${q + 1} ${y}` };
}

/** Monthly rows rolled up into one column per quarter or per year. */
function rollUp(rows: MonthTotals[], view: ChartView) {
  if (view === "monthly") return rows.map((r) => ({ label: shortMonth(r.month), values: [r.incomeMinor, r.expenseMinor] }));
  const groups = new Map<string, [number, number]>();
  for (const r of rows) {
    const key = view === "yearly" ? r.month.slice(0, 4) : `Q${Math.floor((Number(r.month.slice(5)) - 1) / 3) + 1}`;
    const sum = groups.get(key) ?? [0, 0];
    groups.set(key, [sum[0] + r.incomeMinor, sum[1] + r.expenseMinor]);
  }
  return [...groups].map(([label, values]) => ({ label, values }));
}

/** Any month at a glance (this one by default): what's left, the year so far, trends, where the money went, what's due. */
export function DashboardPage() {
  const period = usePeriod();
  const { year, month, prevMonth, monthName, yearLabel } = period;
  const [chartView, setChartView] = useState<ChartView>("monthly");
  const [chartDisplay, setChartDisplay] = useState<ChartDisplay>("chart");
  const [spendScope, setSpendScope] = useState<SpendScope>("month");

  const spendRange =
    spendScope === "month" ? { from: month, to: month, label: monthLabel(month) } : spendScope === "quarter" ? quarterOf(month) : { from: `${year}-01`, to: `${year}-12`, label: String(year) };

  const summary = useAsync(() => api.getSummary(month), [month]);
  const yearly = useAsync(() => api.getRangeSummary(`${year}-01`, `${year}-12`), [year]);
  const lastTwo = useAsync(() => api.getMonthly(month, 2), [month]);
  const chart = useAsync(() => api.getMonthly(`${year}-12`, chartView === "yearly" ? YEARS_SHOWN * 12 : 12), [year, chartView === "yearly"]);
  const spending = useAsync(() => api.getRangeSummary(spendRange.from, spendRange.to), [spendRange.from, spendRange.to]);
  const [recentVersion, setRecentVersion] = useState(0);

  const categories = useAsync(() => api.listCategories(), []);
  const cards = useAsync(() => api.listCards(), []);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // An edit or delete can move totals, the charts, the category split and card reminders.
  function changed() {
    summary.reload();
    yearly.reload();
    lastTwo.reload();
    chart.reload();
    spending.reload();
    cards.reload();
    setRecentVersion((v) => v + 1);
    refreshAlerts();
  }

  async function removeTransaction(tx: Transaction) {
    await api.deleteTransaction(tx.id);
    changed();
  }

  const totals = summary.state.data;
  const yearTotals = yearly.state.data;
  const previous = lastTwo.state.data?.find((r) => r.month === prevMonth);
  const monthRate = rate(totals);
  const yearRate = rate(yearTotals);
  const yearFigure = (minor: number | undefined) => money(minor, "sm");

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle={monthLabel(month)} actions={<PeriodPicker period={period} />} />

      <AlertBanner />

      {summary.state.status === "error" && !totals ? (
        <Card className="kpis kpis--error">
          <EmptyState tone="error" heading="Couldn't load this month's totals" action={
            <Button variant="secondary" size="sm" onClick={summary.reload}>Try again</Button>
          }>
            {summary.state.error.message}
          </EmptyState>
        </Card>
      ) : (
        <section className="kpis" aria-label={`${monthName} and ${yearLabel} at a glance`}>
          <PeriodTile
            label={`Saved · ${monthName}`}
            tone="accent"
            month={totals ? <Amount minorUnits={totals.netMinor} size="lg" tone="neutral" /> : loadingFigure}
            note={
              totals &&
              (totals.netMinor < 0
                ? `You spent ${formatMoney(-totals.netMinor)} more than you earned.`
                : totals.incomeMinor === 0
                  ? "No income recorded this month."
                  : `You kept ${monthRate}% of what came in.`)
            }
            yearLabel={yearLabel}
            year={yearFigure(yearTotals?.netMinor)}
          />
          <PeriodTile
            label={`Income · ${monthName}`}
            month={totals ? <Amount minorUnits={totals.incomeMinor} size="lg" tone="neutral" /> : loadingFigure}
            trend={totals && trend(totals.incomeMinor, previous?.incomeMinor, prevMonth, true)}
            yearLabel={yearLabel}
            year={yearFigure(yearTotals?.incomeMinor)}
          />
          <PeriodTile
            label={`Expenses · ${monthName}`}
            month={totals ? <Amount minorUnits={totals.expenseMinor} size="lg" tone="neutral" /> : loadingFigure}
            trend={totals && trend(totals.expenseMinor, previous?.expenseMinor, prevMonth, false)}
            yearLabel={yearLabel}
            year={yearFigure(yearTotals?.expenseMinor)}
          />
          <PeriodTile
            label={`Savings rate · ${monthName}`}
            tone={totals ? rateTone(monthRate) : undefined}
            month={totals ? <span className="mft-stat__value mft-amount--lg">{rateText(monthRate)}</span> : loadingFigure}
            meter={monthRate}
            yearLabel={yearLabel}
            year={yearTotals ? <span className={`period-tile__rate period-tile__rate--${rateTone(yearRate)}`}>{rateText(yearRate)}</span> : loadingFigure}
          />
        </section>
      )}

      <div className="dash-layout">
        <Card
          title="Income vs expenses"
          subtitle={chartView === "yearly" ? `${year - YEARS_SHOWN + 1} to ${year}` : chartView === "quarterly" ? `${year} by quarter` : `${year} by month`}
          action={
            <div className="chart-controls">
              <SegmentedControl aria-label="Show as" size="sm" options={CHART_DISPLAYS} value={chartDisplay} onChange={setChartDisplay} />
              <SegmentedControl aria-label="Group by" size="sm" options={CHART_VIEWS} value={chartView} onChange={setChartView} />
            </div>
          }
        >
          <Loadable state={chart.state} reload={chart.reload} what="the chart" skeleton="chart">
            {(rows) => {
              const data = rollUp(rows, chartView);
              const period = chartView === "monthly" ? "Month" : chartView === "quarterly" ? "Quarter" : "Year";
              return chartDisplay === "chart" ? (
                <MonthlyBarChart
                  series={incomeVsExpense}
                  description={`Income and expenses per ${period.toLowerCase()}, ${data[0]?.label ?? ""} to ${data.at(-1)?.label ?? ""}.`}
                  data={data}
                  tableToggle={false}
                />
              ) : (
                <div className="chart__table chart__table--scroll" tabIndex={0} role="region" aria-label={`Income and expenses per ${period.toLowerCase()}`}>
                  <ChartTable data={data} series={incomeVsExpense} periodLabel={period} withNet />
                </div>
              );
            }}
          </Loadable>
        </Card>

        <UpcomingDues state={cards.state} reload={cards.reload} />

        <RecentTransactions refresh={recentVersion} onEdit={setEditing} onDelete={removeTransaction} />

        <Card
          title="Where the money went"
          subtitle={spendRange.label}
          action={<SegmentedControl aria-label="Show spending for" size="sm" options={SPEND_SCOPES} value={spendScope} onChange={setSpendScope} />}
          className="dash-fixed dash-fixed--match"
        >
          <div className="dash-fixed__scroll" tabIndex={0} role="region" aria-label="Spending by category">
            <Loadable state={spending.state} reload={spending.reload} what="spending by category" skeleton="bars">
              {(s) => <CategoryBars items={s.expenseByCategory} emptyHeading={`No expenses in ${spendRange.label} yet`} />}
            </Loadable>
          </div>
        </Card>
      </div>

      <EditTransactionDialog
        transaction={editing}
        categories={categories.state.data ?? []}
        cards={cards.state.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          changed();
        }}
      />
    </div>
  );
}
