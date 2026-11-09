import { Amount, Card } from "@mft/ui";
import { api } from "../../api/endpoints";
import { EmptyState } from "../../layout/EmptyState";
import { Loadable } from "../../layout/Loadable";
import { monthLabel, todayLocal } from "../../lib/dates";
import { linkClick } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";

/**
 * What actually came in as salary: the income recorded under the Salary category, this month and this year.
 * The salary setup below is what each payslip *should* be; this is what you logged.
 */
export function SalaryReceived({ expectedMonthlyMinor }: { expectedMonthlyMinor: number | null }) {
  const today = todayLocal();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const totals = useAsync(async (signal) => {
    const categories = await api.listCategories();
    const salary = categories.find((c) => c.type === "income" && c.parentId === null && c.name.trim().toLowerCase() === "salary");
    if (!salary) return null;
    const sum = (from: string, to: string) =>
      api.listTransactions({ type: "income", categoryId: salary.id, from, to, page: 1, pageSize: 1 }, signal);
    const lastDay = new Date(Number(year), Number(month.slice(5)), 0).getDate(); // 30 for November
    const [y, m] = await Promise.all([sum(`${year}-01-01`, `${year}-12-31`), sum(`${month}-01`, `${month}-${lastDay}`)]);
    return { salaryId: salary.id, yearMinor: y.incomeMinor, yearCount: y.total, monthMinor: m.incomeMinor };
  }, []);
  const monthsSoFar = Number(month.slice(5));

  return (
    <Card title="Salary received" subtitle={`Recorded under the Salary category · ${year} so far`}>
      <Loadable state={totals.state} reload={totals.reload} what="salary received" skeleton="bars">
        {(t) =>
          t === null ? (
            <EmptyState heading="No Salary category">Add an income category called Salary and record your pay under it to see the totals here.</EmptyState>
          ) : (
            <div className="salary-received">
              <div>
                <span className="salary-received__label">{monthLabel(month)}</span>
                <Amount minorUnits={t.monthMinor} size="lg" tone="neutral" />
              </div>
              <div>
                <span className="salary-received__label">{year} so far</span>
                <Amount minorUnits={t.yearMinor} size="lg" tone="neutral" />
                <span className="salary-received__hint">
                  {t.yearCount} payment{t.yearCount === 1 ? "" : "s"}
                </span>
              </div>
              {expectedMonthlyMinor !== null && (
                <div>
                  <span className="salary-received__label">Expected take-home, Jan–{monthLabel(month).split(" ")[0]!.slice(0, 3)}</span>
                  <Amount minorUnits={expectedMonthlyMinor * monthsSoFar} size="lg" tone="neutral" />
                  <span className="salary-received__hint">From your salary setup × {monthsSoFar} months</span>
                </div>
              )}
              <a className="link-text salary-received__link" href={`/income/other?categoryId=${t.salaryId}&range=year`} onClick={linkClick}>
                See salary payments
              </a>
            </div>
          )
        }
      </Loadable>
    </Card>
  );
}
