import { Card } from "@mft/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "../../layout/icons";
import { PageHeader } from "../../layout/PageHeader";
import { useState } from "react";
import { api } from "../../api/endpoints";
import { Loadable } from "../../layout/Loadable";
import { currentMonth, monthLabel, shiftMonth, shortMonth } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { CategoryBars } from "../charts/CategoryBars";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";

const expenseSeries = [{ name: "Expenses", color: "var(--chart-expense)" }];

/** Expenses for a chosen month by category, and the 6 months leading up to it. */
export function ExpensesReportPage() {
  const [month, setMonth] = useState(currentMonth);
  const summary = useAsync(() => api.getSummary(month), [month]);
  const monthly = useAsync(() => api.getMonthly(month, 6), [month]);

  return (
    <div className="page">
      <PageHeader
        title="Expenses Report"
        subtitle="Where your money went, by category and over time"
        actions={
          <nav className="month-stepper" aria-label="Month">
            <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeftIcon />
            </button>
            <span className="month-stepper__label" aria-live="polite">
              {monthLabel(month)}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month === currentMonth()}
            >
              <ChevronRightIcon />
            </button>
          </nav>
        }
      />

      <div className="dash-grid report-grid">
        <Card title="By category" subtitle={monthLabel(month)}>
          <Loadable state={summary.state} reload={summary.reload} what="spending by category" skeleton="bars">
            {(s) => <CategoryBars items={s.expenseByCategory} />}
          </Loadable>
        </Card>

        <Card title="Expenses over time" subtitle={`6 months to ${monthLabel(month)}`}>
          <Loadable state={monthly.state} reload={monthly.reload} what="the chart" skeleton="chart">
            {(rows) => (
              <MonthlyBarChart
                series={expenseSeries}
                description={`Expenses per month, ${monthLabel(rows[0]?.month ?? month)} to ${monthLabel(month)}.`}
                data={rows.map((r) => ({ label: shortMonth(r.month), values: [r.expenseMinor] }))}
              />
            )}
          </Loadable>
        </Card>
      </div>
    </div>
  );
}
