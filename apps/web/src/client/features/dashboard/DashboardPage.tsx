import { Amount, Button, Card, formatMoney, StatTile, TransactionRow, type StatTrend } from "@mft/ui";
import { api } from "../../api/endpoints";
import { AlertBanner } from "../../layout/AlertBanner";
import { EmptyState } from "../../layout/EmptyState";
import { transactionMeta } from "../transactions/TransactionList";
import { ExpensesIcon, IncomeIcon, PlusIcon } from "../../layout/icons";
import { Loadable, Skeleton } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { startAddTransaction } from "../../layout/quickAdd";
import { categoryColor } from "../../lib/categoryColor";
import { currentMonth, monthLabel, presetRange, shiftMonth, shortDate, shortMonth } from "../../lib/dates";
import { linkClick } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { CategoryBars } from "../charts/CategoryBars";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";

const RECENT = 6;
/** A figure-shaped placeholder, so a tile never shows ₱0.00 before the real number arrives. */
const loadingFigure = <span className="skeleton__inline" aria-label="Loading" />;
const incomeVsExpense = [
  { name: "Income", color: "var(--chart-income)" },
  { name: "Expenses", color: "var(--chart-expense)" },
];

/** "₱2,300.00 more than September": the change in plain words, with an arrow for direction. */
function trend(current: number, previous: number | undefined, prevMonth: string, upIsGood: boolean): StatTrend | undefined {
  if (previous === undefined || previous === 0) return undefined;
  const diff = current - previous;
  const month = monthLabel(prevMonth).split(" ")[0];
  if (diff === 0) return { direction: "flat", sentiment: "neutral", text: `Same as ${month}` };
  const up = diff > 0;
  return {
    direction: up ? "up" : "down",
    sentiment: up === upIsGood ? "positive" : "negative",
    text: `${formatMoney(Math.abs(diff))} ${up ? "more" : "less"} than ${month}`,
  };
}

/** This month at a glance: what's left (the hero), the 6-month trend, where the money went, the latest entries. */
export function DashboardPage() {
  const month = currentMonth();
  const prevMonth = shiftMonth(month, -1);
  const summary = useAsync(() => api.getSummary(month), [month]);
  const monthly = useAsync(() => api.getMonthly(month, 6), [month]);
  const recent = useAsync(() => api.listTransactions({ ...presetRange("month"), pageSize: RECENT }), [month]);

  const totals = summary.state.data;
  const previous = monthly.state.data?.find((r) => r.month === prevMonth);
  const savingsRate = totals && totals.incomeMinor > 0 ? Math.round((totals.netMinor / totals.incomeMinor) * 100) : null;
  const monthName = monthLabel(month).split(" ")[0];

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle={monthLabel(month)}
        actions={
          <Button className="quick-add" iconStart={<PlusIcon />} onClick={startAddTransaction}>
            Add transaction
          </Button>
        }
      />

      <AlertBanner />

      <div className="overview">
        <section className="hero" aria-label={`Left over in ${monthName}`}>
          {!totals ? (
            summary.state.status === "error" ? (
              <EmptyState tone="error" heading="Couldn't load this month's totals" action={
                <Button variant="secondary" size="sm" onClick={summary.reload}>Try again</Button>
              }>
                {summary.state.error.message}
              </EmptyState>
            ) : (
              <Skeleton kind="bars" label="Loading this month's totals" />
            )
          ) : (
            <>
              <p className="hero__label">Left over in {monthName}</p>
              <Amount className="hero__amount" minorUnits={totals.netMinor} size="display" tone="neutral" />
              <p className="hero__note">
                {totals.netMinor < 0
                  ? `You spent ${formatMoney(-totals.netMinor)} more than you earned.`
                  : savingsRate !== null
                    ? `You kept ${savingsRate}% of what came in.`
                    : "No income recorded yet this month."}
              </p>
              {savingsRate !== null && savingsRate > 0 && (
                <div className="hero__meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, savingsRate)}%` }} />
                </div>
              )}
              <dl className="hero__split">
                <div>
                  <dt>
                    <IncomeIcon /> Came in
                  </dt>
                  <dd>
                    <Amount minorUnits={totals.incomeMinor} size="md" tone="neutral" />
                  </dd>
                </div>
                <div>
                  <dt>
                    <ExpensesIcon /> Went out
                  </dt>
                  <dd>
                    <Amount minorUnits={totals.expenseMinor} size="md" tone="neutral" />
                  </dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <div className="overview__tiles">
          <StatTile
            label="Income"
            minorUnits={totals?.incomeMinor ?? 0}
            value={totals ? undefined : loadingFigure}
            trend={totals && trend(totals.incomeMinor, previous?.incomeMinor, prevMonth, true)}
          />
          <StatTile
            label="Expenses"
            minorUnits={totals?.expenseMinor ?? 0}
            value={totals ? undefined : loadingFigure}
            trend={totals && trend(totals.expenseMinor, previous?.expenseMinor, prevMonth, false)}
          />
          <StatTile label="Savings rate" value={!totals ? loadingFigure : savingsRate === null ? "—" : `${savingsRate}%`} />
        </div>
      </div>

      <div className="dash-grid">
        <Card title="Income vs expenses" subtitle="Last 6 months" className="dash-grid__wide">
          <Loadable state={monthly.state} reload={monthly.reload} what="the chart" skeleton="chart">
            {(rows) => (
              <MonthlyBarChart
                series={incomeVsExpense}
                description={`Income and expenses per month, ${monthLabel(rows[0]?.month ?? month)} to ${monthLabel(month)}.`}
                data={rows.map((r) => ({ label: shortMonth(r.month), values: [r.incomeMinor, r.expenseMinor] }))}
              />
            )}
          </Loadable>
        </Card>

        <Card title="Where the money went" subtitle={monthLabel(month)}>
          <Loadable state={summary.state} reload={summary.reload} what="spending by category" skeleton="bars">
            {(s) => <CategoryBars items={s.expenseByCategory} />}
          </Loadable>
        </Card>

        <Card
          title="Recent transactions"
          subtitle={monthLabel(month)}
          padding="none"
          action={
            <span className="card-links">
              View all{" "}
              <a href="/expenses" onClick={linkClick}>
                expenses
              </a>{" "}
              or{" "}
              <a href="/income" onClick={linkClick}>
                income
              </a>
            </span>
          }
        >
          <Loadable state={recent.state} reload={recent.reload} what="transactions">
            {({ items: txs }) =>
              txs.length === 0 ? (
                <EmptyState heading="No transactions this month yet" action={
                  <Button variant="secondary" size="sm" onClick={startAddTransaction}>Add transaction</Button>
                } />
              ) : (
                <ul className="tx-list">
                  {txs.map((tx) => (
                    <li key={tx.id}>
                      <TransactionRow
                        description={tx.description}
                        category={tx.category.name}
                        categoryColor={categoryColor(tx.category.color)}
                        date={shortDate(tx.occurredOn)}
                        minorUnits={tx.type === "expense" ? -tx.amountMinor : tx.amountMinor}
                        meta={tx.card ? transactionMeta(tx) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )
            }
          </Loadable>
        </Card>
      </div>
    </div>
  );
}
