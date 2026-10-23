import { Amount, Button, Card, formatMoney, ProgressMeter, SegmentedControl } from "@mft/ui";
import { useState } from "react";
import { api } from "../../api/endpoints";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { AlertIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { dueText, refreshAlerts } from "../../lib/alerts";
import { categoryColor } from "../../lib/categoryColor";
import { currentMonth, monthLabel, shortDate, shortMonth } from "../../lib/dates";
import { linkClick, navigate } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { CategoryBars } from "../charts/CategoryBars";
import { MonthlyBarChart } from "../charts/MonthlyBarChart";
import { CardEditor } from "./CardEditor";
import { CardFace, StatusChip } from "./CardFace";
import { PaymentForm } from "./PaymentForm";
import { PaymentsView } from "./PaymentsView";

const insightTabs = [
  { value: "monthly", label: "Monthly spend" },
  { value: "category", label: "By category" },
] as const;

/**
 * One card, in the order you need it: what's due (and pay it), three numbers worth watching,
 * payments and installments, the charges, then insights.
 */
export function CardDetailPage({ id }: { id: number }) {
  const month = currentMonth();
  const card = useAsync(() => api.getCard(id), [id]);
  const allCards = useAsync(() => api.listCards(), [id]);
  const payments = useAsync(() => api.listPayments(id), [id]);
  const monthly = useAsync(() => api.getMonthly(month, 6, id), [id, month]);
  const byCategory = useAsync(() => api.getSummary(month, id), [id, month]);
  const categories = useAsync(() => api.listCategories(), []);
  const [tab, setTab] = useState<(typeof insightTabs)[number]["value"]>("monthly");

  const [dialog, setDialog] = useState<"edit" | "pay" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Anything that changes what's owed reloads the card, its numbers and the alert bell.
  function changed(message: string) {
    if (dialog) setDialog(null);
    setAnnouncement(message);
    card.reload();
    allCards.reload();
    payments.reload();
    monthly.reload();
    byCategory.reload();
    refreshAlerts();
  }

  if (card.state.status === "error") {
    return (
      <div className="page">
        <PageHeader title="Credit card" />
        <section className="panel panel--empty" aria-label="Card not found">
          <EmptyState
            tone="error"
            icon={<AlertIcon />}
            heading={card.state.error.message}
            action={
              <a className="link-button" href="/cards" onClick={linkClick}>
                Back to Credit Cards
              </a>
            }
          />
        </section>
      </div>
    );
  }

  const c = card.state.data;
  if (!c) {
    return (
      <div className="page">
        <PageHeader title="Credit card" />
        <Loadable state={card.state} reload={card.reload} what="the card" skeleton="bars">
          {() => null}
        </Loadable>
      </div>
    );
  }
  const s = c.summary;
  const owed = Math.max(0, s.outstandingMinor);

  return (
    <div className="page">
      <PageHeader
        title={c.name}
        subtitle={[c.issuer, c.last4 && `ending in ${c.last4}`, c.archived && "Archived"].filter(Boolean).join(" · ") || "Credit card"}
        actions={
          <Button variant="secondary" onClick={() => setDialog("edit")}>
            Edit card
          </Button>
        }
      />

      {/* Hero: the one thing that matters most, and the action that settles it. */}
      <section className="card-hero" aria-label="Amount due">
        <CardFace card={c} />
        <div className="card-hero__body">
          <div className="card-hero__head">
            <span className="card-hero__label">{s.remainingDueMinor > 0 ? "Amount due" : "This statement"}</span>
            <StatusChip summary={s} />
          </div>
          <Amount className="card-hero__amount" minorUnits={s.remainingDueMinor} size="display" tone="neutral" />
          <p className="card-hero__due">
            {s.remainingDueMinor > 0
              ? `Due ${shortDate(s.dueDate)} · ${dueText(s.daysUntilDue).toLowerCase()}`
              : s.statementMinor > 0
                ? `Paid. Next statement due ${shortDate(s.dueDate)}`
                : `Nothing due. Next statement due ${shortDate(s.dueDate)}`}
          </p>
          <p className="card-hero__note">
            Statement of {formatMoney(s.statementMinor)} closed {shortDate(s.statementDate)}
            {s.paidSinceStatementMinor > 0 && `, ${formatMoney(s.paidSinceStatementMinor)} paid since`}.{" "}
            {s.outstandingMinor < 0 ? `${formatMoney(-s.outstandingMinor)} credit on the card.` : `Total balance ${formatMoney(owed)}.`}
          </p>
          <div>
            <Button onClick={() => setDialog("pay")}>Record payment</Button>
          </div>
        </div>
      </section>

      {/* Three numbers worth watching; everything else is one click away. */}
      <div className="card-stats">
        <section className="mini-stat" aria-label="Available credit">
          <ProgressMeter
            kind="budget"
            label="Available credit"
            value={c.limitMinor - s.availableMinor}
            max={c.limitMinor}
            warnAt={0.7}
            valueText={formatMoney(s.availableMinor)}
            status={`${s.utilisationPct}% of ${formatMoney(c.limitMinor)} used${s.installmentRemainingMinor > 0 ? ", incl. installments" : ""}`}
          />
        </section>
        <section className="mini-stat" aria-label="This cycle">
          <span className="mini-stat__label">This cycle so far</span>
          <Amount minorUnits={s.cycleSpendMinor} size="lg" tone="neutral" />
          <span className="mini-stat__note">
            {shortDate(s.cycleFrom)} to {shortDate(s.cycleTo)}
          </span>
        </section>
        <section className="mini-stat" aria-label="Installments">
          <span className="mini-stat__label">Installments a month</span>
          <Amount minorUnits={s.installmentMonthlyTotalMinor} size="lg" tone="neutral" />
          <span className="mini-stat__note">
            {s.activeInstallments === 0
              ? "No active plans"
              : `${s.activeInstallments} active · ${formatMoney(s.installmentRemainingMinor)} left`}
          </span>
        </section>
      </div>

      <div className="card-section">
        <PaymentsView
          card={c}
          categories={categories.state.data ?? []}
          payments={payments.state.data ?? []}
          cards={allCards.state.data ?? []}
          onRecordPayment={() => setDialog("pay")}
          onChanged={changed}
        />
      </div>

      <div className="card-section">
        <Card
          title="Insights"
          subtitle={tab === "monthly" ? "Charges per month, last 6 months" : `Spending by category, ${monthLabel(month)}`}
          action={<SegmentedControl aria-label="Insight" size="sm" options={insightTabs} value={tab} onChange={setTab} />}
        >
          {tab === "monthly" ? (
            <Loadable state={monthly.state} reload={monthly.reload} what="the chart" skeleton="chart">
              {(rows) => (
                <MonthlyBarChart
                  series={[{ name: "Charged", color: categoryColor(c.color) }]}
                  description={`Charges on ${c.name} per month, ${monthLabel(rows[0]?.month ?? month)} to ${monthLabel(month)}.`}
                  data={rows.map((r) => ({ label: shortMonth(r.month), values: [r.expenseMinor] }))}
                />
              )}
            </Loadable>
          ) : (
            <Loadable state={byCategory.state} reload={byCategory.reload} what="spending by category" skeleton="bars">
              {(sum) => <CategoryBars items={sum.expenseByCategory} />}
            </Loadable>
          )}
        </Card>
      </div>

      <Dialog open={dialog === "edit"} onClose={() => setDialog(null)} title={`Edit ${c.name}`}>
        {dialog === "edit" && (
          <CardEditor
            card={c}
            all={allCards.state.data ?? []}
            onSaved={(message) => changed(message)}
            onDeleted={() => navigate("/cards")}
            onCancel={() => setDialog(null)}
          />
        )}
      </Dialog>
      <Dialog open={dialog === "pay"} onClose={() => setDialog(null)} title={`Record a payment to ${c.name}`}>
        {dialog === "pay" && <PaymentForm card={c} onSaved={changed} onCancel={() => setDialog(null)} />}
      </Dialog>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
