import { Amount, Card, formatMoney } from "@mft/ui";
import type { CardKind, CardSummary, InstallmentDetail } from "../../../shared/contracts";
import { daysBetween, dueDateFor } from "../../../shared/cardCycle";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { EmptyState } from "../../layout/EmptyState";
import { dueText } from "../../lib/alerts";
import { cardPath } from "../../lib/cardPaths";
import { categoryColor } from "../../lib/categoryColor";
import { shortDate, todayLocal } from "../../lib/dates";
import { linkClick } from "../../lib/router";

/**
 * Loans and installment plans with what each still needs paid, and the "Payments due" list: shared by
 * Online Credit and the Expenses summary.
 */
export interface Loan {
  plan: InstallmentDetail;
  account: CardSummary;
  /** The next payment not billed yet, with its due date; null once everything is billed. */
  next: { amountMinor: number; dueDate: string } | null;
}

/** Accounts of one kind (or all) with their loans and installment plans, newest first. */
export async function loadLoans(kind?: CardKind) {
  const accounts = (await api.listCards()).filter((c) => !kind || c.kind === kind);
  const plans = await Promise.all(accounts.map((a) => api.listInstallments(a.id)));
  const loans: Loan[] = accounts.flatMap((account, i) =>
    plans[i]!.map((plan) => {
      // Everything billed on the same statement is one payment (the fee rides along with month 1).
      const entry = plan.schedule.find((e) => e.status === "upcoming");
      const amountMinor = entry ? plan.schedule.filter((e) => e.billedOn === entry.billedOn).reduce((sum, e) => sum + e.amountMinor, 0) : 0;
      return { plan, account, next: entry ? { amountMinor, dueDate: dueDateFor(entry.billedOn, account.dueDay) } : null };
    }),
  );
  loans.sort((a, b) => b.plan.purchasedOn.localeCompare(a.plan.purchasedOn));
  return { accounts, loans };
}


export interface Due {
  key: string;
  account: CardSummary;
  dueDate: string;
  amountMinor: number;
  /** What it's for: "Billed statement", or the loans billed on that date. */
  what: string;
  billed: boolean;
}

/** Every payment still to make on these accounts: what's billed and unpaid, then each future loan month, by account and due date. */
export function duesFor(accounts: CardSummary[], loans: Loan[]): Due[] {
  const dues: Due[] = [];
  for (const a of accounts) {
    if (!a.archived && a.summary.remainingDueMinor > 0) {
      dues.push({ key: `b${a.id}`, account: a, dueDate: a.summary.dueDate, amountMinor: a.summary.remainingDueMinor, what: "Billed statement", billed: true });
    }
  }
  const upcoming = new Map<string, Due & { names: Set<string> }>();
  for (const { plan, account } of loans) {
    if (plan.status !== "active") continue;
    for (const e of plan.schedule) {
      if (e.status !== "upcoming") continue;
      const dueDate = dueDateFor(e.billedOn, account.dueDay);
      const key = `${account.id}:${dueDate}`;
      const row = upcoming.get(key) ?? { key, account, dueDate, amountMinor: 0, what: "", billed: false, names: new Set<string>() };
      row.amountMinor += e.amountMinor;
      row.names.add(plan.description);
      upcoming.set(key, row);
    }
  }
  for (const { names, ...row } of upcoming.values()) dues.push({ ...row, what: [...names].join(", ") });
  return dues.sort((x, y) => x.dueDate.localeCompare(y.dueDate) || x.account.name.localeCompare(y.account.name));
}

/** A scrollable list of every payment due on online credit: the date, the account, what it's for and how much. */
export function LoanDues({ accounts, loans }: { accounts: CardSummary[]; loans: Loan[] }) {
  const today = todayLocal();
  const dues = duesFor(accounts, loans);
  const in30 = dues.filter((d) => daysBetween(today, d.dueDate) <= 30).reduce((sum, d) => sum + d.amountMinor, 0);
  return (
    <Card
      title="Payments due"
      subtitle={dues.length === 0 ? "Nothing to pay" : `${dues.length} payment${dues.length === 1 ? "" : "s"} · ${formatMoney(in30)} in the next 30 days`}
      className="loan-dues"
      padding="none"
    >
      {dues.length === 0 ? (
        <EmptyState heading="Nothing due">No billed amounts or upcoming loan months on these accounts.</EmptyState>
      ) : (
        <>
          <div className="loan-dues__head" aria-hidden="true">
            <span>Due date</span>
            <span>Account</span>
            <span>Payment</span>
          </div>
          <div className="loan-dues__scroll" tabIndex={0} role="region" aria-label="Payments due by account and date">
            <ul className="dues loan-dues__list">
              {dues.map((d) => {
                const days = daysBetween(today, d.dueDate);
                const tone = days < 0 ? "overdue" : days <= 7 ? "soon" : "later";
                const [mon, day] = shortDate(d.dueDate).split(" ");
                return (
                  <li key={d.key}>
                    <a className={`dues__row dues__row--${tone}`} href={cardPath(d.account)} onClick={linkClick}>
                      <span className="dues__date" aria-hidden="true">
                        <span>{mon}</span>
                        <strong>{day}</strong>
                      </span>
                      <span className="dues__main">
                        <span className="dues__name">
                          <ColorDot color={categoryColor(d.account.color)} /> {d.account.name}
                        </span>
                        <span className="dues__when">
                          {d.what} · {dueText(days).toLowerCase()}
                        </span>
                      </span>
                      <span className="loan-dues__amount">
                        <Amount minorUnits={d.amountMinor} size="md" tone="neutral" />
                        <span className="visually-hidden">
                          {" "}
                          due {shortDate(d.dueDate)} to {d.account.name}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
