import { Amount, Button, Card, formatMoney, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { newPersonPaymentSchema, type PersonBilling, type PersonDetail, type PersonPayment } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { shortDate, todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";
import { linkClick, navigate } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";
import { PersonForm } from "./PeoplePage";

type FieldErrors = Partial<Record<"amountMinor" | "paidOn" | "note", string>>;

/** Money they gave back. Prefilled with what they owe. */
function RepaymentForm({ person, onSaved, onCancel }: { person: PersonDetail; onSaved: (message: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(person.balanceMinor > 0 ? (person.balanceMinor / 100).toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseAmountToMinor(amount);
    const parsed = newPersonPaymentSchema.safeParse({ amountMinor: amountMinor ?? Number.NaN, paidOn, note });
    if (!parsed.success || amountMinor === null) {
      const next: FieldErrors = {};
      if (amountMinor === null) next.amountMinor = "Enter an amount like 1,500.00.";
      for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as keyof FieldErrors] ??= issue.message;
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      await api.addPersonPayment(person.id, parsed.data);
      onSaved(`${formatMoney(parsed.data.amountMinor)} from ${person.name} recorded`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <p className="cat-editor__hint">
        {person.balanceMinor > 0 ? `${person.name} owes you ${formatMoney(person.balanceMinor)}.` : `${person.name} doesn't owe you anything right now.`} A
        repayment isn't income: it settles what they owe.
      </p>
      <TextField label="Amount" prefix="₱" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amountMinor} data-autofocus />
      <TextField label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} />
      <TextField label="Note" hint="Optional" maxLength={200} placeholder="GCash" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      {formError && (
        <p className="cat-editor__error" role="alert">
          {formError}
        </p>
      )}
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Record repayment
        </Button>
      </div>
    </form>
  );
}

/** The note a "Paid" button writes on the repayment, so its Undo can find it. */
const paidNote = (b: PersonBilling) => `Paid: billing due ${b.dueDate}`;
const PAID_ALL_NOTE = "Paid all billed";

function billingStatus(b: PersonBilling) {
  switch (b.status) {
    case "paid":
      return <span className="bill-badge bill-badge--paid">Paid</span>;
    case "unpaid":
      return <span className="bill-badge bill-badge--unpaid">Unpaid</span>;
    case "partial":
      return <span className="bill-badge">Partly paid</span>;
    default: {
      const days = Math.round((Date.parse(`${b.dueDate}T00:00:00Z`) - Date.parse(`${todayLocal()}T00:00:00Z`)) / 86_400_000);
      return <span className="bill-badge">{days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}</span>;
    }
  }
}

/**
 * Charges grouped by billing (card statement or cash month), newest first, as an accordion. "Paid" records
 * a repayment for that billing plus anything unpaid before it; past-due billings show Unpaid and move to the next one.
 */
function BillingsCard({ person: p, onChanged }: { person: PersonDetail; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Everything still to pay, including installment months not billed yet.
  const owing = p.billings.reduce((sum, b) => sum + b.remainingMinor, 0);
  const today = todayLocal();
  const coming = p.billings.filter((b) => b.dueDate >= today); // soonest first
  const past = p.billings.filter((b) => b.dueDate < today).reverse(); // newest first
  const nextKey = coming.find((b) => b.remainingMinor > 0)?.key;

  async function pay(amountMinor: number, note: string, key: string, message: string) {
    setError(null);
    setBusy(key);
    try {
      await api.addPersonPayment(p.id, { amountMinor, paidOn: todayLocal(), note });
      onChanged(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(b: PersonBilling) {
    const payment = p.payments.find((pay) => pay.note === paidNote(b));
    if (!payment) return;
    setBusy(b.key);
    try {
      await api.deletePersonPayment(p.id, payment.id);
      onChanged(`Billing due ${shortDate(b.dueDate)} marked unpaid`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Billings"
      subtitle={`${p.name}'s charges by statement, including installment months still to come. Unpaid after the due date moves to the next billing.`}
      padding="none"
      action={
        owing > 0 && (
          <Button size="sm" onClick={() => setConfirmAll(true)} loading={busy === "all"}>
            Paid all
          </Button>
        )
      }
    >
      {error && (
        <p className="cat-editor__error" role="alert">
          {error}
        </p>
      )}
      {p.billings.length === 0 ? (
        <EmptyState heading="No charges yet">Pick {p.name} under "For" when you add a charge or installment, or split one with them.</EmptyState>
      ) : (
        <>
          {coming.length > 0 && (
            <>
              <h3 className="bill-section">Coming up</h3>
              <ul className="bill-list">{coming.map(renderBilling)}</ul>
            </>
          )}
          {past.length > 0 && (
            <>
              <h3 className="bill-section">Past billings</h3>
              <ul className="bill-list">{past.map(renderBilling)}</ul>
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmAll}
        title="Mark everything as paid?"
        message={`${p.name} paid you ${formatMoney(owing)}: every billing is settled${p.upcomingMinor > 0 ? `, including installment months not billed yet (${formatMoney(p.upcomingMinor)}), paid in advance` : ""}.`}
        confirmLabel="Paid all"
        onConfirm={() => pay(owing, PAID_ALL_NOTE, "all", `All billings paid (${formatMoney(owing)})`)}
        onClose={() => setConfirmAll(false)}
      />
    </Card>
  );

  function renderBilling(b: PersonBilling) {
            const canUndo = b.status === "paid" && p.payments.some((pay) => pay.note === paidNote(b));
            // Open what needs attention: unpaid, part-paid, and the next billing to pay.
            const open = b.status === "unpaid" || b.status === "partial" || b.key === nextKey;
            const futureOnly = b.items.every((i) => i.upcoming);
            return (
              <li key={b.key}>
                <details className={`bill bill--${b.status}`} open={open}>
                  <summary className="bill__head">
                    <span className="bill__when">
                      <strong>{b.closeDate ? `Due ${shortDate(b.dueDate)}` : `Cash or debit · ${monthName(b.dueDate)}`}</strong>
                      <small>
                        {b.cardName ? `${b.cardName} · statement ${shortDate(b.closeDate!)}` : `Due ${shortDate(b.dueDate)}`} · {b.items.length} charge
                        {b.items.length === 1 ? "" : "s"}
                        {futureOnly && " · not billed yet"}
                      </small>
                    </span>
                    {billingStatus(b)}
                    <Amount minorUnits={b.amountMinor} tone="neutral" />
                  </summary>
                  <div className="bill__body">
                    {b.carriedInMinor > 0 && (
                      <p className="bill__note">
                        + {formatMoney(b.carriedInMinor)} carried over from unpaid billings: {formatMoney(b.remainingMinor + b.carriedInMinor)} due{" "}
                        {shortDate(b.dueDate)}.
                      </p>
                    )}
                    {b.status === "unpaid" && (
                      <p className="bill__note bill__note--warn">
                        Not paid by {shortDate(b.dueDate)}.{" "}
                        {b.movedTo ? `${formatMoney(b.remainingMinor)} moved to the billing due ${shortDate(b.movedTo)}.` : `${formatMoney(b.remainingMinor)} is still owed.`}
                      </p>
                    )}
                    {b.status === "partial" && <p className="bill__note">{formatMoney(b.paidMinor)} paid, {formatMoney(b.remainingMinor)} left.</p>}
                    <ul className="share-list">
                      {b.items.map((s) => (
                        <li key={s.key} className={s.upcoming ? "share-row share-row--upcoming" : "share-row"}>
                          <span className="share-row__date">{shortDate(s.occurredOn)}</span>
                          <span className="share-row__what">
                            {s.description}
                            <small>
                              {s.upcoming ? "Installment · not billed yet" : s.installmentId !== null ? "Installment" : "Straight"}
                              {s.amountMinor !== s.totalMinor && ` · their part of ${formatMoney(s.totalMinor)}`}
                            </small>
                          </span>
                          <Amount minorUnits={s.amountMinor} tone="neutral" />
                        </li>
                      ))}
                    </ul>
                    <div className="bill__actions">
                      {b.remainingMinor > 0 ? (
                        <Button
                          size="sm"
                          loading={busy === b.key}
                          disabled={busy !== null && busy !== b.key}
                          onClick={() => pay(b.payMinor, paidNote(b), b.key, `Billing due ${shortDate(b.dueDate)} paid`)}
                        >
                          {b.payMinor > b.remainingMinor ? `Paid · ${formatMoney(b.payMinor)} incl. earlier` : `Paid · ${formatMoney(b.payMinor)}`}
                        </Button>
                      ) : canUndo ? (
                        <Button size="sm" variant="ghost" loading={busy === b.key} onClick={() => undo(b)}>
                          Undo paid
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </details>
              </li>
            );
  }
}

/**
 * Installments by billing: each billing (due date) folds open to the plans billed on it, and each plan folds
 * open to all its months. "Paid all" on a billing pays that billing (and anything unpaid before it, oldest first).
 */
function InstallmentsCard({ person: p, onChanged }: { person: PersonDetail; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocal();
  // Only billings with an installment month in them.
  const withPlans = p.billings.filter((b) => b.items.some((i) => i.installmentId !== null));
  const coming = withPlans.filter((b) => b.dueDate >= today);
  const past = withPlans.filter((b) => b.dueDate < today).reverse();
  const nextKey = coming.find((b) => b.remainingMinor > 0)?.key;

  async function payBilling(b: PersonBilling) {
    setError(null);
    setBusy(b.key);
    try {
      await api.addPersonPayment(p.id, { amountMinor: b.payMinor, paidOn: today, note: paidNote(b) });
      onChanged(`Billing due ${shortDate(b.dueDate)} paid`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(b: PersonBilling) {
    const payment = p.payments.find((pay) => pay.note === paidNote(b));
    if (!payment) return;
    setBusy(b.key);
    try {
      await api.deletePersonPayment(p.id, payment.id);
      onChanged(`Billing due ${shortDate(b.dueDate)} marked unpaid`);
    } finally {
      setBusy(null);
    }
  }

  function renderBilling(b: PersonBilling) {
    const items = b.items.filter((i) => i.installmentId !== null);
    const planTotal = items.reduce((sum, i) => sum + i.amountMinor, 0);
    // What "Paid all" pays beyond these installment months: earlier unpaid billings, and straight charges on this one.
    const earlier = b.payMinor - b.remainingMinor;
    const straight = b.remainingMinor - items.filter((i) => !i.paid).reduce((sum, i) => sum + i.amountMinor, 0);
    const extra = [earlier > 0 && "earlier unpaid", straight > 0 && "other charges"].filter(Boolean).join(" and ");
    const canUndo = b.status === "paid" && p.payments.some((pay) => pay.note === paidNote(b));
    const open = b.status === "unpaid" || b.status === "partial" || b.key === nextKey;
    return (
      <li key={b.key}>
        <details className={`bill bill--${b.status}`} open={open}>
          <summary className="bill__head">
            <span className="bill__when">
              <strong>Due {shortDate(b.dueDate)}</strong>
              <small>
                {b.cardName} · {items.length} installment{items.length === 1 ? "" : "s"}
                {items.every((i) => i.upcoming) && " · not billed yet"}
              </small>
            </span>
            {billingStatus(b)}
            <Amount minorUnits={planTotal} tone="neutral" />
          </summary>
          <div className="bill__body">
            {b.status === "unpaid" && (
              <p className="bill__note bill__note--warn">
                Not paid by {shortDate(b.dueDate)}.{b.movedTo ? ` Moved to the billing due ${shortDate(b.movedTo)}.` : ""}
              </p>
            )}
            <ul className="bill-list bill-list--nested">
              {items.map((item) => {
                const plan = p.plans.find((pl) => pl.installmentId === item.installmentId);
                const months = planMonths(p, item.installmentId!);
                const current = months.find((m) => m.key === item.key);
                return (
                  <li key={item.key}>
                    <details className="bill plan">
                      <summary className="bill__head plan__head">
                        <span className="share-row__what">
                          {plan?.description ?? item.description}
                          <small>
                            {monthLabel(item.description, plan?.description ?? "")}
                            {plan && ` · ${months.filter((m) => m.paid).length} of ${plan.months} paid`}
                          </small>
                        </span>
                        {current && monthBadge(current)}
                        <Amount minorUnits={item.amountMinor} tone="neutral" />
                      </summary>
                      <div className="bill__body">
                        <ul className="share-list">
                          {months.map((m) => (
                            <li
                              key={m.key}
                              className={`share-row${m.upcoming && !m.paid ? " share-row--upcoming" : ""}${m.key === item.key ? " share-row--current" : ""}`}
                            >
                              <span className="share-row__date">{shortDate(m.occurredOn)}</span>
                              <span className="share-row__what">
                                {monthLabel(m.description, plan?.description ?? "")}
                                <small>
                                  Due {shortDate(m.dueDate)}
                                  {m.amountMinor !== m.totalMinor && ` · their part of ${formatMoney(m.totalMinor)}`}
                                </small>
                              </span>
                              {monthBadge(m)}
                              <Amount minorUnits={m.amountMinor} tone="neutral" />
                            </li>
                          ))}
                        </ul>
                        {plan && (
                          <p className="bill__note">
                            {plan.status === "active" ? `${formatMoney(plan.upcomingMinor)} left · ` : ""}
                            <a className="link-text" href={`/cards/${plan.cardId}`} onClick={linkClick}>
                              Open the plan on {plan.cardName}
                            </a>
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
            <div className="bill__actions">
              {b.remainingMinor > 0 ? (
                <Button size="sm" loading={busy === b.key} disabled={busy !== null && busy !== b.key} onClick={() => payBilling(b)}>
                  {extra ? `Paid all · ${formatMoney(b.payMinor)} incl. ${extra}` : `Paid all · ${formatMoney(b.payMinor)}`}
                </Button>
              ) : canUndo ? (
                <Button size="sm" variant="ghost" loading={busy === b.key} onClick={() => undo(b)}>
                  Undo paid
                </Button>
              ) : null}
            </div>
          </div>
        </details>
      </li>
    );
  }

  return (
    <Card title="Installments" subtitle={`${p.name}'s installment months by billing. Open a plan to see all its months.`} padding="none">
      {error && (
        <p className="cat-editor__error" role="alert">
          {error}
        </p>
      )}
      {coming.length > 0 && (
        <>
          <h3 className="bill-section">Coming up</h3>
          <ul className="bill-list">{coming.map(renderBilling)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h3 className="bill-section">Past billings</h3>
          <ul className="bill-list">{past.map(renderBilling)}</ul>
        </>
      )}
    </Card>
  );
}

type PlanMonth = PersonBilling["items"][number] & { dueDate: string; pastDue: boolean };

/** One plan's months (billed and still to come), oldest first, each with its billing's due date. */
function planMonths(p: PersonDetail, installmentId: number): PlanMonth[] {
  const today = todayLocal();
  return p.billings
    .flatMap((b) => b.items.filter((i) => i.installmentId === installmentId).map((i) => ({ ...i, dueDate: b.dueDate, pastDue: b.dueDate < today })))
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.key.localeCompare(b.key));
}

/** "Laptop (4/12)" → "Month 4 of 12"; "Laptop (processing fee)" → "Processing fee". */
function monthLabel(description: string, plan: string) {
  const inner = description.startsWith(plan) ? description.slice(plan.length).trim().replace(/^\((.*)\)$/, "$1") : description;
  const m = /^(\d+)\/(\d+)$/.exec(inner);
  return m ? `Month ${m[1]} of ${m[2]}` : inner.charAt(0).toUpperCase() + inner.slice(1);
}

function monthBadge(m: PlanMonth) {
  if (m.paid) return <span className="bill-badge bill-badge--paid">{m.upcoming ? "Paid ahead" : "Paid"}</span>;
  if (m.pastDue) return <span className="bill-badge bill-badge--unpaid">Unpaid</span>;
  if (m.upcoming) return <span className="bill-badge bill-badge--later">Not billed yet</span>;
  return <span className="bill-badge">Due</span>;
}

const monthName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });

type Mode = "repay" | "rename" | "delete" | { deletePayment: PersonPayment } | null;

/** One person: what they owe, every charge they have a part of, and their repayments. */
export function PersonPage({ id }: { id: number }) {
  const person = useAsync(() => api.getPerson(id), [id]);
  const [mode, setMode] = useState<Mode>(null);
  const [announcement, setAnnouncement] = useState("");

  function changed(message: string) {
    setMode(null);
    setAnnouncement(message);
    person.reload();
  }

  return (
    <div className="page">
      <Loadable state={person.state} reload={person.reload} what="this person" skeleton="rows">
        {(p) => {
          const hasHistory = p.shareCount > 0 || p.payments.length > 0;
          return (
            <>
              <PageHeader
                title={p.name}
                subtitle={
                  <a className="link-text" href="/people" onClick={linkClick}>
                    ← All people
                  </a>
                }
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setMode("rename")}>
                      Rename
                    </Button>
                    {p.archived ? (
                      <Button variant="secondary" onClick={async () => changed((await api.updatePerson(p.id, { archived: false })) && `${p.name} unarchived`)}>
                        Unarchive
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => setMode("delete")}>
                        {hasHistory ? "Archive" : "Delete"}
                      </Button>
                    )}
                    <Button onClick={() => setMode("repay")}>Record repayment</Button>
                  </>
                }
              />

              <section className="person-owed" aria-label="Balance">
                <div className="person-owed__main">
                  <div>
                    <span className="card-tile__label">{p.balanceMinor >= 0 ? "Owes you now" : p.upcomingMinor > 0 ? "Paid in advance" : "You owe them"}</span>
                    <Amount minorUnits={Math.abs(p.balanceMinor)} size="lg" tone="neutral" />
                    <small>Billed so far, minus what they paid back</small>
                  </div>
                  <div>
                    <span className="card-tile__label">Total to pay off</span>
                    <Amount minorUnits={Math.max(0, p.toPayOffMinor)} size="lg" tone="neutral" />
                    <small>
                      {p.toPayOffMinor <= 0 && p.chargedMinor + p.upcomingMinor > 0
                        ? "Everything is paid, including months not billed yet"
                        : p.upcomingMinor > 0
                          ? `Including ${formatMoney(p.upcomingMinor)} of installments to come`
                          : "Nothing left to be billed"}
                    </small>
                  </div>
                </div>
                <dl className="person-owed__parts">
                  <div>
                    <dt>Straight charges</dt>
                    <dd>{formatMoney(p.straightMinor)}</dd>
                  </div>
                  <div>
                    <dt>Installments billed</dt>
                    <dd>{formatMoney(p.installmentBilledMinor)}</dd>
                  </div>
                  <div>
                    <dt>Installments to come</dt>
                    <dd>
                      {formatMoney(p.upcomingMinor)}
                      {p.monthlyMinor > 0 && <small> · {formatMoney(p.monthlyMinor)}/mo</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Paid back</dt>
                    <dd>−{formatMoney(p.repaidMinor)}</dd>
                  </div>
                </dl>
              </section>

              <div className="person-sections">
              {p.plans.length > 0 && <InstallmentsCard person={p} onChanged={changed} />}

              <BillingsCard person={p} onChanged={changed} />

              <Card title="Repayments" subtitle="Money they've given back" padding="none">
                {p.payments.length === 0 ? (
                  <EmptyState heading="No repayments yet">When {p.name} pays you back, record it here.</EmptyState>
                ) : (
                  <ul className="share-list">
                    {p.payments.map((pay) => (
                      <li key={pay.id} className="share-row">
                        <span className="share-row__date">{shortDate(pay.paidOn)}</span>
                        <span className="share-row__what">{pay.note ?? "Repayment"}</span>
                        <Amount minorUnits={pay.amountMinor} tone="neutral" />
                        <Button variant="ghost" size="sm" onClick={() => setMode({ deletePayment: pay })} aria-label={`Delete the ${formatMoney(pay.amountMinor)} repayment`}>
                          Delete
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              </div>

              <Dialog open={mode === "repay"} onClose={() => setMode(null)} title={`Repayment from ${p.name}`}>
                {mode === "repay" && <RepaymentForm person={p} onSaved={changed} onCancel={() => setMode(null)} />}
              </Dialog>
              <Dialog open={mode === "rename"} onClose={() => setMode(null)} title={`Rename ${p.name}`}>
                {mode === "rename" && <PersonForm person={p} onSaved={(saved) => changed(`Renamed to ${saved.name}`)} onCancel={() => setMode(null)} />}
              </Dialog>
              <ConfirmDialog
                open={mode === "delete"}
                title={hasHistory ? `Archive ${p.name}?` : `Delete ${p.name}?`}
                message={
                  hasHistory
                    ? `${p.name} has charges or repayments, so they're archived instead: hidden from "For" and "Usually used by", with their history kept.`
                    : `${p.name} has no charges. Cards they usually use go back to you.`
                }
                confirmLabel={hasHistory ? "Archive" : "Delete"}
                onConfirm={async () => {
                  if (hasHistory) changed((await api.updatePerson(p.id, { archived: true })) && `${p.name} archived`);
                  else {
                    await api.deletePerson(p.id);
                    navigate("/people");
                  }
                }}
                onClose={() => setMode(null)}
              />
              <ConfirmDialog
                open={typeof mode === "object" && mode !== null}
                title="Delete this repayment?"
                message={typeof mode === "object" && mode ? `${formatMoney(mode.deletePayment.amountMinor)} on ${shortDate(mode.deletePayment.paidOn)} goes back onto what ${p.name} owes.` : ""}
                onConfirm={async () => {
                  if (typeof mode === "object" && mode) {
                    await api.deletePersonPayment(p.id, mode.deletePayment.id);
                    changed("Repayment deleted");
                  }
                }}
                onClose={() => setMode(null)}
              />
            </>
          );
        }}
      </Loadable>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
