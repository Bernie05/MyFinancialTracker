import { Card, formatMoney } from "@mft/ui";
import type { ReactNode } from "react";
import type { CardKind, CardSummary, MonthTotals, PaidWith } from "../../../shared/contracts";
import { daysBetween } from "../../../shared/cardCycle";
import { api } from "../../api/endpoints";
import { CardIcon, CashIcon, OnlineCreditIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { dueText } from "../../lib/alerts";
import { monthLabel, shortDate, shortMonth, todayLocal } from "../../lib/dates";
import { linkClick } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { creditTotals } from "../cards/CreditSummary";
import { duesFor, loadLoans, LoanDues, type Loan } from "../cards/dues";
import { CategoryBars } from "../charts/CategoryBars";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { money, PeriodPicker, PeriodTile, trend, usePeriod } from "../dashboard/period";

interface Section {
  key: PaidWith;
  name: string;
  href: string;
  icon: ReactNode;
  color: string;
  /** The card kind behind it; cash has none. */
  kind: CardKind | null;
}

const SECTIONS: Section[] = [
  { key: "online", name: "Online Credit", href: "/online-credit", icon: <OnlineCreditIcon />, color: "var(--chart-3)", kind: "online" },
  { key: "bank", name: "Credit Cards", href: "/cards", icon: <CardIcon />, color: "var(--chart-1)", kind: "bank" },
  { key: "cash", name: "Cash & Others", href: "/expenses/cash", icon: <CashIcon />, color: "var(--chart-5)", kind: null },
];

const spent = (rows: MonthTotals[] | undefined, month: string) => (rows ? (rows.find((r) => r.month === month)?.expenseMinor ?? 0) : undefined);
const sum = <T,>(items: T[], pick: (t: T) => number) => items.reduce((s, t) => s + pick(t), 0);

/** What the credit side of a section owes and still needs paid. */
function creditFigures(accounts: CardSummary[], loans: Loan[]) {
  const active = loans.filter((l) => l.plan.status === "active");
  const dues = duesFor(accounts, loans);
  return {
    credit: creditTotals(accounts),
    monthlyMinor: sum(active, (l) => (l.plan.preterminatedOn ? 0 : l.plan.monthlyMinor)),
    stillToBillMinor: sum(active, (l) => l.plan.remainingMinor),
    activeCount: active.length,
    next: dues[0],
  };
}

/**
 * Expenses is the summary of its three sections: Online Credit, Credit Cards and Cash & Others. The totals
 * add them up; each section card shows its own figures and opens the section.
 */
export function ExpensesOverviewPage() {
  const period = usePeriod();
  const { year, month, prevMonth, monthName, yearLabel } = period;
  const to = `${year}-12`;
  const today = todayLocal();

  // 13 months per section: the picked year plus last December, for January's trend.
  const online = useAsync(() => api.getMonthly(to, 13, { paidWith: "online" }), [to]);
  const bank = useAsync(() => api.getMonthly(to, 13, { paidWith: "bank" }), [to]);
  const cash = useAsync(() => api.getMonthly(to, 13, { paidWith: "cash" }), [to]);
  const summary = useAsync(() => api.getSummary(month), [month]);
  const credit = useAsync(() => loadLoans(), []);

  const bySection: Record<PaidWith, MonthTotals[] | undefined> = { online: online.state.data, bank: bank.state.data, cash: cash.state.data };
  const loaded = SECTIONS.every((s) => bySection[s.key]);
  const inYear = (rows: MonthTotals[] | undefined) => rows?.filter((r) => r.month.startsWith(`${year}-`));
  const yearSum = (rows: MonthTotals[] | undefined) => (rows ? sum(inYear(rows)!, (r) => r.expenseMinor) : undefined);
  // The parent's spending is the sum of its sections, month by month.
  const totalAt = (m: string) => (loaded ? sum(SECTIONS, (s) => spent(bySection[s.key], m)!) : undefined);
  const totalMonth = totalAt(month);
  const totalYear = loaded ? sum(SECTIONS, (s) => yearSum(bySection[s.key])!) : undefined;

  const data = credit.state.data;
  const ofKind = (kind: CardKind) => {
    const accounts = data ? data.accounts.filter((a) => a.kind === kind) : [];
    return creditFigures(accounts, data ? data.loans.filter((l) => l.account.kind === kind) : []);
  };
  const all = data ? creditFigures(data.accounts, data.loans) : undefined;
  const dues = data ? duesFor(data.accounts, data.loans) : [];
  const due30 = sum(dues.filter((d) => daysBetween(today, d.dueDate) <= 30), (d) => d.amountMinor);

  return (
    <div className="page">
      <PageHeader title="Expenses" subtitle={`Online Credit, Credit Cards and Cash & Others · ${monthLabel(month)}`} actions={<PeriodPicker period={period} />} />

      {/* The three sections added up. */}
      <section className="kpis" aria-label={`All expenses, ${monthName}`}>
        <PeriodTile
          label={`Total spent · ${monthName}`}
          tone="accent"
          month={money(totalMonth)}
          trend={totalMonth !== undefined ? trend(totalMonth, totalAt(prevMonth), prevMonth, false) : undefined}
          note="Online + cards + cash"
          yearLabel={yearLabel}
          year={money(totalYear, "sm")}
        />
        <PeriodTile
          label="Credit used"
          month={money(all?.credit.usedMinor)}
          note={all ? `${formatMoney(all.credit.availableMinor)} available of ${formatMoney(all.credit.limitMinor)}` : undefined}
          meter={all && all.credit.limitMinor > 0 ? (all.credit.usedMinor / all.credit.limitMinor) * 100 : null}
          yearLabel="Accounts"
          year={all ? String(all.credit.count) : "…"}
        />
        <PeriodTile
          label="Monthly payments"
          month={money(all?.monthlyMinor)}
          note={all ? `${all.activeCount} active loan${all.activeCount === 1 ? "" : "s"} and installments` : undefined}
          yearLabel="Still to bill"
          year={money(all?.stillToBillMinor, "sm")}
        />
        <PeriodTile
          label="Due in 30 days"
          month={money(data ? due30 : undefined)}
          note={dues[0] ? `Next: ${shortDate(dues[0].dueDate)} · ${dues[0].account.name}` : data ? "Nothing due" : undefined}
          yearLabel="Next payment"
          year={dues[0] ? money(dues[0].amountMinor, "sm") : "—"}
        />
      </section>

      {/* One card per section, with its own figures. */}
      <section className="exp-sections" aria-label="Expense sections">
        {SECTIONS.map((s) => {
          const rows = bySection[s.key];
          const m = spent(rows, month);
          const f = s.kind ? ofKind(s.kind) : null;
          return (
            <a key={s.key} className="exp-section" href={s.href} onClick={linkClick}>
              <span className="exp-section__head">
                <span className="exp-section__icon" style={{ color: s.color }} aria-hidden="true">
                  {s.icon}
                </span>
                <span className="exp-section__name">{s.name}</span>
                <span className="exp-section__open">Open ›</span>
              </span>
              <span className="exp-section__row">
                <span className="exp-section__label">Spent · {monthName}</span>
                {money(m)}
              </span>
              <span className="exp-section__row exp-section__row--sub">
                <span>{yearLabel}</span>
                <span>{rows ? formatMoney(yearSum(rows)!) : "…"}</span>
              </span>
              {f && (
                <>
                  <span className="exp-section__row exp-section__row--sub">
                    <span>Credit</span>
                    <span>
                      {!data ? "…" : f.credit.count === 0 ? "No accounts yet" : `${formatMoney(f.credit.limitMinor)} − ${formatMoney(f.credit.usedMinor)} = ${formatMoney(f.credit.availableMinor)}`}
                    </span>
                  </span>
                  <span className="exp-section__row exp-section__row--sub">
                    <span>Monthly payments</span>
                    <span>{data ? formatMoney(f.monthlyMinor) : "…"}</span>
                  </span>
                  <span className="exp-section__row exp-section__row--sub">
                    <span>Next due</span>
                    <span>{!data ? "…" : f.next ? `${shortDate(f.next.dueDate)} · ${formatMoney(f.next.amountMinor)} · ${f.next.account.name}` : "Nothing due"}</span>
                  </span>
                </>
              )}
              {!f && (
                <span className="exp-section__row exp-section__row--sub">
                  <span>Paid by</span>
                  <span>Cash, debit and e-wallet</span>
                </span>
              )}
              {s.kind && f?.next && <span className={`exp-section__due exp-section__due--${daysBetween(today, f.next.dueDate) < 0 ? "late" : "ok"}`}>{dueText(daysBetween(today, f.next.dueDate))}</span>}
            </a>
          );
        })}
      </section>

      <div className="dash-layout">
        <Card title="How you paid" subtitle={`${year} by month`} className="overview__chart">
          <Loadable state={cash.state} reload={cash.reload} what="the chart" skeleton="chart">
            {() => (
              <MonthlyBarChart
                series={SECTIONS.map((s) => ({ name: s.name, color: s.color }))}
                tableToggle
                description={`Spending per month in ${year}, by Online Credit, Credit Cards and Cash & Others.`}
                data={(inYear(online.state.data) ?? []).map((r) => ({
                  label: shortMonth(r.month),
                  values: SECTIONS.map((s) => spent(bySection[s.key], r.month) ?? 0),
                }))}
              />
            )}
          </Loadable>
        </Card>

        <Loadable state={credit.state} reload={credit.reload} what="payments due" skeleton="rows">
          {(d) => <LoanDues accounts={d.accounts} loans={d.loans} />}
        </Loadable>

        <Card title="Where the money went" subtitle={monthLabel(month)} className="dash-fixed exp-wide">
          <div className="dash-fixed__scroll" tabIndex={0} role="region" aria-label="Spending by category">
            <Loadable state={summary.state} reload={summary.reload} what="spending by category" skeleton="bars">
              {(s) => <CategoryBars items={s.expenseByCategory} emptyHeading={`No expenses in ${monthLabel(month)} yet`} />}
            </Loadable>
          </div>
        </Card>
      </div>
    </div>
  );
}

