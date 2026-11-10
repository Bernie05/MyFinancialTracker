import { Amount, Badge, Button, Card, formatMoney, ProgressMeter } from "@mft/ui";
import { useState } from "react";
import { loanTypeLabels, type CardKind, type CardSummary } from "../../../shared/contracts";
import { daysBetween, dueDateFor } from "../../../shared/cardCycle";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { CardIcon, OnlineCreditIcon, PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { dueText, refreshAlerts } from "../../lib/alerts";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { cardPath } from "../../lib/cardPaths";
import { categoryColor } from "../../lib/categoryColor";
import { shortDate, todayLocal } from "../../lib/dates";
import { linkClick, navigate } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { CardEditor } from "./CardEditor";
import { loadLoans, LoanDues, type Loan } from "./dues";
import { SectionDashboard } from "../overview/SectionDashboard";
import { SectionTransactions } from "../overview/SectionTransactions";
import { money, PeriodTile, usePeriod } from "../dashboard/period";

function LoanRow({ loan }: { loan: Loan }) {
  const { plan, account, next } = loan;
  const done = plan.status === "completed";
  return (
    <li>
      <a className="loan" href={cardPath(account)} onClick={linkClick}>
        <span className="loan__head">
          <span className="loan__lender">
            <ColorDot color={categoryColor(account.color)} /> {account.name}
          </span>
          <span className="loan__name">
            {plan.description} {plan.loanType && <Badge tone="goal">{loanTypeLabels[plan.loanType]}</Badge>}
          </span>
          <span className="loan__meta">
            {formatMoney(plan.principalMinor)} {plan.loanType ? "borrowed" : "bought"} {shortDate(plan.purchasedOn)} · {plan.months} months
            {plan.addOnRateBps > 0 && ` · ${(plan.addOnRateBps / 100).toFixed(2)}% a month`}
          </span>
        </span>
        <span className="loan__figures">
          <span>
            <span className="loan__label">Monthly</span>
            <Amount minorUnits={plan.monthlyMinor} size="md" tone="neutral" />
          </span>
          <span>
            <span className="loan__label">Still to bill</span>
            <Amount minorUnits={plan.remainingMinor} size="md" tone="neutral" />
          </span>
          <span>
            <span className="loan__label">{done ? "Finished" : "Next due"}</span>
            <span className="loan__due">{done ? shortDate(plan.endsOn) : next ? `${shortDate(next.dueDate)} · ${dueText(daysBetween(todayLocal(), next.dueDate)).toLowerCase()}` : "—"}</span>
          </span>
        </span>
        <ProgressMeter
          className="loan__progress"
          kind="goal"
          label={`Month ${Math.min(plan.monthsBilled, plan.months)} of ${plan.months}`}
          value={Math.min(plan.monthsBilled, plan.months)}
          max={plan.months}
          valueText={`${formatMoney(plan.totalMinor - plan.remainingMinor)} of ${formatMoney(plan.totalMinor)} billed`}
        />
      </a>
    </li>
  );
}

/** The words that differ between the two credit sections; everything else is the same page. */
const COPY: Record<
  CardKind,
  {
    title: string;
    subtitle: string;
    add: string;
    addTitle: string;
    plans: string;
    plansTitle: string;
    finished: string;
    empty: string;
    emptyText: string;
    noPlans: string;
    accounts: string;
    icon: JSX.Element;
  }
> = {
  online: {
    title: "Online Credit",
    subtitle: "Loans and pay-later from SPayLater, SLoan, Home Credit and others",
    add: "Add account",
    addTitle: "Add online credit account",
    plans: "loans",
    plansTitle: "Active loans",
    finished: "Finished loans",
    empty: "No online credit accounts yet",
    emptyText:
      "Add your SPayLater, SLoan, Home Credit or other account with its credit limit. Then open it and use Add loan: each loan comes off the available credit, and you'll get a reminder before each due date.",
    noPlans: "Open an account below and use Add loan to record what you borrowed.",
    accounts: "Accounts",
    icon: <OnlineCreditIcon />,
  },
  bank: {
    title: "Credit Cards",
    subtitle: "Bank cards (BPI, Metrobank…): charges, installments, loans and when each is due",
    add: "Add card",
    addTitle: "Add credit card",
    plans: "installments and loans",
    plansTitle: "Active installments and loans",
    finished: "Finished installments and loans",
    empty: "No credit cards yet",
    emptyText:
      "Add a bank card (BPI, Metrobank…) with its limit, statement day and due day. Then open it to add charges, installments or loans: each comes off the available credit, and you'll get a reminder before each due date.",
    noPlans: "Open a card below and use Add installment or Add loan.",
    accounts: "Cards",
    icon: <CardIcon />,
  },
};

/**
 * A credit section: Online Credit (SPayLater, SLoan…) or Credit Cards (BPI, Metrobank…). Both are the same
 * page with the same features; only the words and the data differ. Each loan or installment is a plan on
 * its account; the account page shows the schedule, payments and due dates.
 */
export function CreditSectionPage({ kind }: { kind: CardKind }) {
  const copy = COPY[kind];
  const data = useAsync(() => loadLoans(kind), [kind]);
  const all = useAsync(() => api.listCards(), []);
  const [dialog, setDialog] = useState<"account" | null>(null);

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/expenses", label: "Expenses" }}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <Button iconStart={<PlusIcon />} onClick={() => setDialog("account")}>
            {copy.add}
          </Button>
        }
      />

      <Loadable state={data.state} reload={data.reload} what={`your ${copy.plans}`} skeleton="bars">
        {({ accounts, loans }) => <CreditBody kind={kind} accounts={accounts} loans={loans} onAddAccount={() => setDialog("account")} onChanged={() => { data.reload(); all.reload(); }} />}
      </Loadable>

      <Dialog open={dialog === "account"} onClose={() => setDialog(null)} title={copy.addTitle}>
        {dialog === "account" && (
          <CardEditor
            card={null}
            all={all.state.data ?? []}
            defaultKind={kind}
            // Straight to the new account, where its loans are added.
            onSaved={(_message, id) => navigate(`/cards/${id}`)}
            onCancel={() => setDialog(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Each lender account with what's owed; open one to add a loan to it, or delete it. */
function AccountList({ kind, accounts, onAdd, onDeleted }: { kind: CardKind; accounts: CardSummary[]; onAdd: () => void; onDeleted: () => void }) {
  const copy = COPY[kind];
  const [deleting, setDeleting] = useState<CardSummary | null>(null);
  const loansOn = (a: CardSummary) => a.summary.activeInstallments;
  return (
    <>
      <h2 className="salary__section-title loans__accounts-title">{copy.accounts}</h2>
      <ul className="loan-accounts">
        {accounts.map((a) => (
          <li key={a.id} className="loan-account__item">
            <a className="loan-account" href={cardPath(a)} onClick={linkClick}>
              <ColorDot color={categoryColor(a.color)} />
              <span className="loan-account__name">
                {a.name}
                {a.archived && " (archived)"}
              </span>
              <span className="loan-account__owed">
                {formatMoney(a.summary.availableMinor)} available of {formatMoney(a.limitMinor)} · {formatMoney(Math.max(0, a.summary.outstandingMinor))} owed
              </span>
            </a>
            <Button variant="ghost" size="sm" className="loan-account__delete" onClick={() => setDeleting(a)} aria-label={`Delete ${a.name}`}>
              Delete
            </Button>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="loan-accounts__empty">
            <EmptyState
              icon={copy.icon}
              heading={copy.empty}
              action={
                <Button iconStart={<PlusIcon />} onClick={onAdd}>
                  {copy.add}
                </Button>
              }
            >
              {copy.emptyText}
            </EmptyState>
          </li>
        )}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete account?"}
        message={
          deleting
            ? deleting.transactionCount > 0 || loansOn(deleting) > 0
              ? `This deletes ${deleting.name} with its ${copy.plans}, ${deleting.transactionCount} billed charge${deleting.transactionCount === 1 ? "" : "s"} and payments, for good. They leave your expenses and reports. To keep the history, open the account, choose Edit account and tick Archived instead.`
              : `${deleting.name} has no ${copy.plans} or charges. It's deleted right away.`
            : ""
        }
        confirmLabel={deleting && (deleting.transactionCount > 0 || loansOn(deleting) > 0) ? "Delete with history" : "Delete account"}
        onConfirm={async () => {
          if (!deleting) return;
          await api.deleteCard(deleting.id, { withHistory: true });
          refreshAlerts();
          setDeleting(null);
          onDeleted();
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/** Accounts first, then the shared section dashboard, payments due, plans and transactions: all follow the picked account. */
function CreditBody({ kind, accounts, loans, onAddAccount, onChanged }: { kind: CardKind; accounts: CardSummary[]; loans: Loan[]; onAddAccount: () => void; onChanged: () => void }) {
  const copy = COPY[kind];
  const period = usePeriod();
  const [picked, setPicked] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  // With no accounts yet the page keeps its full layout (all zeros); the list at the top offers the first one.

  const shownAccounts = picked === null ? accounts : accounts.filter((a) => a.id === picked);
  const shownLoans = picked === null ? loans : loans.filter((l) => l.account.id === picked);
  const active = shownLoans.filter((l) => l.plan.status === "active");
  const finished = shownLoans.filter((l) => l.plan.status === "completed");
  const dueNow = shownAccounts.filter((a) => !a.archived).reduce((sum, a) => sum + a.summary.remainingDueMinor, 0);
  const monthly = active.reduce((s, l) => s + l.plan.monthlyMinor, 0);

  return (
    <>
      <AccountList kind={kind} accounts={shownAccounts} onAdd={onAddAccount} onDeleted={() => { setPicked(null); onChanged(); }} />

      <SectionDashboard
        type="expense"
        noun="account"
        sources={accounts.map((a) => ({ id: a.id, name: a.name, color: categoryColor(a.color), archived: a.archived }))}
        base={{ paidWith: kind }}
        filterFor={(id) => ({ cardId: id })}
        picked={picked}
        onPick={setPicked}
        period={period}
        credit={accounts}
        reloadKey={version}
        tiles={
          <>
            <PeriodTile label="Due now" month={money(dueNow)} note="Billed and not paid yet" yearLabel="Monthly payments" year={money(monthly, "sm")} />
            <PeriodTile
              label="Still to bill"
              month={money(active.reduce((s, l) => s + l.plan.remainingMinor, 0))}
              note={`Future months of active ${copy.plans}`}
              yearLabel="Active"
              year={String(active.length)}
            />
          </>
        }
      />

      <LoanDues accounts={shownAccounts} loans={shownLoans} />

      <Card title={copy.plansTitle} subtitle="Open one to see its schedule, payments and due dates" padding="none" className="section-dash__list">
        {active.length === 0 ? (
          <EmptyState heading={shownLoans.length === 0 ? `No ${copy.plans} yet` : "All paid off"}>
            {shownLoans.length === 0 ? copy.noPlans : `Every one of these ${copy.plans} is finished.`}
          </EmptyState>
        ) : (
          <ul className="loans">{active.map((l) => <LoanRow key={l.plan.id} loan={l} />)}</ul>
        )}
      </Card>

      {finished.length > 0 && (
        <details className="archived">
          <summary>{copy.finished} ({finished.length})</summary>
          <Card padding="none">
            <ul className="loans">{finished.map((l) => <LoanRow key={l.plan.id} loan={l} />)}</ul>
          </Card>
        </details>
      )}

      <SectionTransactions
        type="expense"
        month={period.month}
        filters={{ paidWith: kind, cardId: picked ?? undefined }}
        cards={accounts}
        allowCash={false}
        emptyText="Billed loan and installment months, and charges added on an account, show up here."
        onChanged={() => {
          setVersion((v) => v + 1);
          onChanged();
        }}
      />
    </>
  );
}

