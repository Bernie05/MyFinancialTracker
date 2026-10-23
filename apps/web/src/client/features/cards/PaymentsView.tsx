import { Badge, Button, Card, formatMoney, TextField } from "@mft/ui";
import { useState } from "react";
import type { CardPayment, CardSummary, Category, InstallmentDetail, ScheduleEntry } from "../../../shared/contracts";
import { nextClose } from "../../../shared/cardCycle";
import { api } from "../../api/endpoints";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { categoryColor } from "../../lib/categoryColor";
import { monthLabel, shortDate, todayLocal } from "../../lib/dates";
import { useAsync } from "../../lib/useAsync";
import { InstallmentEditor } from "./InstallmentEditor";
import { OtherCharges } from "./OtherCharges";

interface PaymentsViewProps {
  card: CardSummary;
  categories: Category[];
  payments: CardPayment[];
  /** All cards, for the add-charge form's "Paid with". */
  cards: CardSummary[];
  onRecordPayment: () => void;
  /** Something changed what's owed: the page reloads the card, its numbers and the bell. */
  onChanged: (message: string) => void;
}

type Mode =
  | { kind: "add" }
  | { kind: "edit" | "preterminate" | "delete"; plan: InstallmentDetail }
  | { kind: "delete-payment"; payment: CardPayment }
  | null;

const entryLabel = (e: ScheduleEntry, months: number) =>
  e.kind === "fee" ? "Processing fee" : e.kind === "pretermination" ? "Pre-termination" : `Month ${e.month} of ${months}`;

/**
 * Everything paid or billed on this card, grouped: one group per installment plan (its months as
 * sub-rows, newest first) and one for payments made to the card. Active plans start open.
 */
export function PaymentsView({ card, categories, payments, cards, onRecordPayment, onChanged }: PaymentsViewProps) {
  const plans = useAsync(() => api.listInstallments(card.id), [card.id]);
  const [mode, setMode] = useState<Mode>(null);

  function changed(message: string) {
    setMode(null);
    plans.reload();
    onChanged(message);
  }

  const paidTotal = payments.reduce((sum, p) => sum + p.amountMinor, 0);

  return (
    <Card
      title="Charges and payments"
      subtitle="Everyday charges by statement, installment plans, and what you've paid"
      padding="none"
      action={
        <Button variant="ghost" size="sm" iconStart={<PlusIcon />} onClick={() => setMode({ kind: "add" })} disabled={card.archived}>
          Add installment
        </Button>
      }
    >
      <Loadable state={plans.state} reload={plans.reload} what="installments" skeleton="bars">
        {(all) => {
          const ordered = [...all.filter((p) => p.status === "active"), ...all.filter((p) => p.status === "completed")];
          return (
            <div className="pgroups">
              {/* Everyday charges first: the group that changes daily. Then plans, then payments. */}
              <OtherCharges card={card} categories={categories} cards={cards} onChanged={onChanged} />
              {ordered.map((plan) => (
                <PlanGroup key={plan.id} plan={plan} onAction={(kind) => setMode({ kind, plan })} />
              ))}

              <details className="pgroup" open>
                <summary className="pgroup__head">
                  <span className="pgroup__title">
                    <span className="pgroup__name">Card payments</span>
                    <span className="pgroup__sub">
                      {payments.length === 0 ? "None yet" : `${payments.length} payment${payments.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <span className="pgroup__figures">
                    <span className="pgroup__amount">{formatMoney(paidTotal)}</span>
                    <span className="pgroup__sub">paid in total</span>
                  </span>
                </summary>
                {payments.length === 0 ? (
                  <EmptyState heading="No payments recorded">Record what you pay so the card shows what's still due.</EmptyState>
                ) : (
                  <ul className="pgroup__rows">
                    {payments.map((p) => (
                      <li key={p.id} className="prow">
                        <span className="prow__date">{shortDate(p.paidOn)}</span>
                        <span className="prow__label">{p.note ?? "Payment"}</span>
                        <span className="prow__amount">{formatMoney(p.amountMinor)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMode({ kind: "delete-payment", payment: p })}
                          aria-label={`Delete payment of ${formatMoney(p.amountMinor)} on ${shortDate(p.paidOn)}`}
                        >
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pgroup__actions">
                  <Button size="sm" onClick={onRecordPayment}>
                    Record payment
                  </Button>
                </div>
              </details>
            </div>
          );
        }}
      </Loadable>

      <Dialog
        open={mode?.kind === "add" || mode?.kind === "edit"}
        onClose={() => setMode(null)}
        title={mode?.kind === "edit" ? `Edit ${mode.plan.description}` : "Add installment"}
      >
        {(mode?.kind === "add" || mode?.kind === "edit") && (
          <InstallmentEditor
            card={card}
            plan={mode.kind === "edit" ? mode.plan : null}
            categories={categories}
            onSaved={changed}
            onCancel={() => setMode(null)}
          />
        )}
      </Dialog>

      <Dialog open={mode?.kind === "preterminate"} onClose={() => setMode(null)} title={mode?.kind === "preterminate" ? `Pre-terminate ${mode.plan.description}` : "Pre-terminate"}>
        {mode?.kind === "preterminate" && <Preterminate card={card} plan={mode.plan} onDone={changed} onCancel={() => setMode(null)} />}
      </Dialog>

      <ConfirmDialog
        open={mode?.kind === "delete"}
        title={mode?.kind === "delete" ? `Delete “${mode.plan.description}”?` : "Delete installment?"}
        message={
          mode?.kind === "delete"
            ? `This removes the plan and its ${mode.plan.monthsBilled} billed month${mode.plan.monthsBilled === 1 ? "" : "s"} from your expenses and statements. To stop it early instead, use Pre-terminate.`
            : ""
        }
        onConfirm={async () => {
          if (mode?.kind !== "delete") return;
          await api.deleteInstallment(mode.plan.id);
          changed(`${mode.plan.description} deleted`);
        }}
        onClose={() => setMode(null)}
      />

      <ConfirmDialog
        open={mode?.kind === "delete-payment"}
        title={mode?.kind === "delete-payment" ? `Delete the ${formatMoney(mode.payment.amountMinor)} payment?` : "Delete payment?"}
        message={
          mode?.kind === "delete-payment"
            ? `The ${shortDate(mode.payment.paidOn)} payment will no longer count toward what you owe on ${card.name}.`
            : ""
        }
        onConfirm={async () => {
          if (mode?.kind !== "delete-payment") return;
          await api.deletePayment(card.id, mode.payment.id);
          changed("Payment deleted");
        }}
        onClose={() => setMode(null)}
      />
    </Card>
  );
}

/** One plan: header with progress and money, then its months newest first (later months folded away). */
function PlanGroup({ plan, onAction }: { plan: InstallmentDetail; onAction: (kind: "edit" | "preterminate" | "delete") => void }) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const active = plan.status === "active";
  const billed = plan.schedule.filter((e) => e.status === "billed").reverse();
  const upcoming = plan.schedule.filter((e) => e.status === "upcoming");
  // Newest first: the next upcoming month sits on top; the rest of the future folds into one row.
  const shownUpcoming = showAllUpcoming ? [...upcoming].reverse() : upcoming.slice(0, 1);
  const pct = Math.round((plan.monthsBilled / plan.months) * 100);

  const row = (e: ScheduleEntry) => (
    <li key={e.seq} className={`prow${e.status === "upcoming" ? " prow--upcoming" : ""}`}>
      <span className="prow__date">{shortDate(e.billedOn)}</span>
      <span className="prow__label">{entryLabel(e, plan.months)}</span>
      <span className="prow__amount">{formatMoney(e.amountMinor)}</span>
      <span className={`inst-status inst-status--${e.status}`}>{e.status === "billed" ? "Billed" : "Upcoming"}</span>
    </li>
  );

  return (
    <details className="pgroup" open={active}>
      <summary className="pgroup__head">
        <span className="pgroup__title">
          <span className="pgroup__name">{plan.description}</span>
          <span className="pgroup__sub">
            <Badge category={categoryColor(plan.category.color)}>{plan.category.name}</Badge>
            {plan.preterminatedOn ? "Pre-terminated" : active ? `${plan.monthsBilled} of ${plan.months}` : "Completed"}
            {plan.addOnRateBps > 0 && ` · ${plan.addOnRateBps / 100}% a month`}
          </span>
          <span className="pgroup__bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="pgroup__figures">
          <span className="pgroup__amount">{active && !plan.preterminatedOn ? `${formatMoney(plan.monthlyMinor)}/mo` : formatMoney(plan.totalMinor)}</span>
          <span className="pgroup__sub">
            {active ? `${formatMoney(plan.remainingMinor)} left · ends ${monthLabel(plan.endsOn.slice(0, 7))}` : `Ended ${monthLabel(plan.endsOn.slice(0, 7))}`}
          </span>
        </span>
      </summary>
      <ul className="pgroup__rows">
        {shownUpcoming.map(row)}
        {!showAllUpcoming && upcoming.length > 1 && (
          <li className="prow prow--more">
            <button type="button" className="link-text" onClick={() => setShowAllUpcoming(true)}>
              Show {upcoming.length - 1} more upcoming, through {monthLabel(plan.endsOn.slice(0, 7))}
            </button>
          </li>
        )}
        {billed.map(row)}
      </ul>
      <div className="pgroup__actions">
        <Button variant="ghost" size="sm" className="dialog__left" onClick={() => onAction("delete")}>
          Delete
        </Button>
        {active && (
          <Button variant="secondary" size="sm" onClick={() => onAction("preterminate")}>
            Pre-terminate
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => onAction("edit")}>
          Edit
        </Button>
      </div>
    </details>
  );
}

/** Pay off early: the remaining principal is billed on the statement for that date's cycle. */
function Preterminate({ card, plan, onDone, onCancel }: { card: CardSummary; plan: InstallmentDetail; onDone: (m: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(todayLocal());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  async function confirm() {
    setBusy(true);
    try {
      await api.updateInstallment(plan.id, { preterminatedOn: date });
      onDone(`${plan.description} pre-terminated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="cat-editor">
      <p className="cat-editor__hint">
        The {formatMoney(plan.unbilledPrincipalMinor)} principal still unbilled goes on the statement closing{" "}
        {valid ? shortDate(nextClose(date, card.closingDay)) : "after that date"}, in one amount. No more add-on interest is charged.
        Banks may add a pre-termination fee; record it as an expense if yours does.
      </p>
      <TextField label="Pre-termination date" type="date" value={date} min={plan.purchasedOn} onChange={(e) => setDate(e.target.value)} error={error ?? undefined} data-autofocus />
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={confirm} loading={busy} disabled={!valid}>
          Pre-terminate
        </Button>
      </div>
    </div>
  );
}
