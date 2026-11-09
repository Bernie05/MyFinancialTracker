import { Amount, Card, formatMoney } from "@mft/ui";
import type { MonthTotals } from "../../../shared/contracts";
import { salaryBreakdown } from "../../../shared/salary";
import { api } from "../../api/endpoints";
import { IncomeIcon, SalaryIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { monthLabel, shortMonth } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { money, PeriodPicker, PeriodTile, trend, usePeriod } from "../dashboard/period";
import { SectionLinks } from "./SectionLinks";

const series = [
  { name: "Salary", color: "var(--chart-income)" },
  { name: "Other income", color: "var(--chart-2)" },
];

/** Undefined while loading; 0 for a month with nothing (or with no Salary category at all). */
const income = (rows: MonthTotals[] | undefined, month: string) => (rows ? (rows.find((r) => r.month === month)?.incomeMinor ?? 0) : undefined);
const yearTotal = (rows: MonthTotals[] | undefined) => rows?.reduce((sum, r) => sum + r.incomeMinor, 0);

/**
 * Income at a glance: everything that came in, split into salary (the Salary category) and the rest
 * (rent, freelance…), for the picked month and its year, with the way into My Salary and Other Income.
 */
export function IncomeOverviewPage() {
  const period = usePeriod();
  const { year, month, prevMonth, monthName, yearLabel } = period;

  const salaryId = useAsync(async () => {
    const categories = await api.listCategories();
    return categories.find((c) => c.type === "income" && c.parentId === null && c.name.trim().toLowerCase() === "salary")?.id ?? null;
  }, []);
  const id = salaryId.state.data;
  const ready = id !== undefined;
  // Twelve months of the picked year, salary and everything else, plus December of last year for January's trend.
  const salary = useAsync(() => (ready && id !== null ? api.getMonthly(`${year}-12`, 13, { categoryId: id }) : Promise.resolve([])), [year, ready, id]);
  const other = useAsync(() => (ready ? api.getMonthly(`${year}-12`, 13, id === null ? {} : { excludeCategoryId: id }) : new Promise<MonthTotals[]>(() => {})), [year, ready, id]);
  const profile = useAsync(() => api.getSalary(), []);

  const thisYear = (rows: MonthTotals[] | undefined) => rows?.filter((r) => r.month.startsWith(`${year}-`));
  const s = thisYear(salary.state.data);
  const o = thisYear(other.state.data);
  const both = (pick: (rows: MonthTotals[] | undefined) => number | undefined) => {
    const a = pick(salary.state.data);
    const b = pick(other.state.data);
    return a === undefined || b === undefined ? undefined : a + b;
  };
  const totalMonth = both((r) => income(r, month));
  const totalPrev = both((r) => income(r, prevMonth));
  const salaryMonth = income(s, month);
  const otherMonth = income(o, month);
  const breakdown = profile.state.data?.profile ? salaryBreakdown(profile.state.data.profile) : null;

  return (
    <div className="page">
      <PageHeader title="Income" subtitle={`Everything that came in · ${monthLabel(month)}`} actions={<PeriodPicker period={period} />} />

      <section className="kpis" aria-label={`Income for ${monthName} and ${yearLabel}`}>
        <PeriodTile
          label={`Total income · ${monthName}`}
          tone="accent"
          note="Salary + other income"
          month={money(totalMonth)}
          trend={totalMonth !== undefined ? trend(totalMonth, totalPrev, prevMonth, true) : undefined}
          yearLabel={yearLabel}
          year={money(both((r) => yearTotal(thisYear(r))), "sm")}
        />
        <PeriodTile
          label={`Salary · ${monthName}`}
          month={money(salaryMonth)}
          trend={salaryMonth !== undefined ? trend(salaryMonth, income(salary.state.data, prevMonth), prevMonth, true) : undefined}
          yearLabel={yearLabel}
          year={money(yearTotal(s), "sm")}
        />
        <PeriodTile
          label={`Other income · ${monthName}`}
          month={money(otherMonth)}
          trend={otherMonth !== undefined ? trend(otherMonth, income(other.state.data, prevMonth), prevMonth, true) : undefined}
          yearLabel={yearLabel}
          year={money(yearTotal(o), "sm")}
        />
        <PeriodTile
          label="Take-home pay · per month"
          month={profile.state.data ? (breakdown ? <Amount minorUnits={breakdown.monthlyNetMinor} size="lg" tone="neutral" /> : <span className="mft-stat__value mft-amount--lg">—</span>) : money(undefined)}
          note={profile.state.data && !breakdown ? "Set up your salary to see it." : breakdown ? `After ${formatMoney(breakdown.monthlyDeductionsMinor)} in deductions` : undefined}
          yearLabel="Per year"
          year={breakdown ? money(breakdown.annualNetMinor, "sm") : "—"}
        />
      </section>

      <div className="dash-layout">
        <Card title="Salary and other income" subtitle={`${year} by month`} className="overview__chart">
          <Loadable state={other.state} reload={other.reload} what="the chart" skeleton="chart">
            {() => (
              <MonthlyBarChart
                series={series}
                tableToggle
                description={`Salary and other income per month in ${year}.`}
                data={(o ?? []).map((r, i) => ({ label: shortMonth(r.month), values: [s?.[i]?.incomeMinor ?? 0, r.incomeMinor] }))}
              />
            )}
          </Loadable>
        </Card>

        <SectionLinks
          title="Income sections"
          subtitle="Open one to see the details"
          links={[
            {
              href: "/income/salary",
              icon: <SalaryIcon />,
              label: "My Salary",
              detail: breakdown
                ? `${formatMoney(breakdown.monthlyGrossMinor)} gross · tax, SSS, PhilHealth, Pag-IBIG`
                : "Set up your salary and payslip deductions",
              figure: money(yearTotal(s), "sm"),
            },
            {
              href: "/income/other",
              icon: <IncomeIcon />,
              label: "Other Income",
              detail: "Rent, freelance, condo and anything that isn't salary",
              figure: money(yearTotal(o), "sm"),
            },
          ]}
        />
      </div>
    </div>
  );
}
