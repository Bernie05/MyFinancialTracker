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


type ItemGroup = {
  key: string;
  title: string;
  plan: PersonDetail["plans"][number] | undefined;
  months: PlanMonth[];
  totalMinor: number;
  paidMinor: number;
  payments: PersonPayment[];
};

/** A person's charges by item: each installment plan, and each straight charge, oldest first. */
function itemGroups(p: PersonDetail): ItemGroup[] {
  const today = todayLocal();
  const groups = new Map<string, ItemGroup>();
  for (const b of p.billings) {
    for (const i of b.items) {
      const key = i.installmentId !== null ? `p${i.installmentId}` : i.key;
      const plan = i.installmentId !== null ? p.plans.find((pl) => pl.installmentId === i.installmentId) : undefined;
      const g = groups.get(key) ?? { key, title: plan?.description ?? i.description, plan, months: [], totalMinor: 0, paidMinor: 0, payments: [] };
      g.months.push({ ...i, dueDate: b.dueDate, pastDue: b.dueDate < today, cardName: b.cardName });
      g.totalMinor += i.amountMinor;
      g.paidMinor += i.paidMinor;
      groups.set(key, g);
    }
  }
  for (const g of groups.values()) {
    g.months.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.key.localeCompare(b.key));
    // Repayments for the item and for any of its months.
    g.payments = p.payments.filter((pay) => pay.itemKey === g.key || pay.itemKey?.startsWith(`${g.key}-`));
  }
  return [...groups.values()].sort((a, b) => a.months[0]!.occurredOn.localeCompare(b.months[0]!.occurredOn));
}

const monthName = (g: ItemGroup, m: PlanMonth) => (g.plan ? monthLabel(m.description, g.plan.description) : m.description);
/** The note a month's "Paid" writes on the repayment. */
const monthNote = (g: ItemGroup, m: PlanMonth) => `Paid: ${g.title} · ${monthName(g, m)}`;

/**
 * Charges by item (an installment plan, or a straight charge) as an accordion. Each item header shows
 * what's left with "Full paid", and each month inside has
 * its own "Paid". A month's or item's repayment is for that item, so it lowers exactly what it says.
 */
function ItemsCard({ person: p, onChanged }: { person: PersonDetail; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ItemGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = itemGroups(p);

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setError(null);
    setBusy(key);
    try {
      await action();
      onChanged(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const pay = (key: string, amountMinor: number, note: string, itemKey: string | null, message: string) =>
    run(key, () => api.addPersonPayment(p.id, { amountMinor, paidOn: todayLocal(), note, itemKey }), message);
  const remove = (key: string, payment: PersonPayment, message: string) => run(key, () => api.deletePersonPayment(p.id, payment.id), message);

  function renderMonth(g: ItemGroup, m: PlanMonth) {
    const left = m.amountMinor - m.paidMinor;
    // Each month's "Paid" is a repayment for that month only; its Undo takes back the latest one.
    const undoable = m.paid ? g.payments.find((pay) => pay.itemKey === m.monthKey) : undefined;
    const busyKey = `${g.key}:${m.key}`;
    return (
      <li key={m.key} className={`share-row share-row--action${m.upcoming && !m.paid ? " share-row--upcoming" : ""}`}>
        <span className="share-row__date">{shortDate(m.occurredOn)}</span>
        <span className="share-row__what">
          {monthName(g, m)}
          <small>
            Due {shortDate(m.dueDate)}
            {m.amountMinor !== m.totalMinor && ` · their part of ${formatMoney(m.totalMinor)}`}
            {!m.paid && m.paidMinor > 0 && ` · ${formatMoney(m.paidMinor)} paid`}
          </small>
        </span>
        {monthBadge(m)}
        <Amount minorUnits={m.amountMinor} tone="neutral" />
        <span className="share-row__action">
          {left > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === busyKey}
              disabled={busy !== null && busy !== busyKey}
              onClick={() => pay(busyKey, left, monthNote(g, m), m.monthKey, `${monthName(g, m)} of ${g.title} paid`)}
            >
              Paid
            </Button>
          ) : undoable ? (
            <Button size="sm" variant="ghost" loading={busy === busyKey} onClick={() => remove(busyKey, undoable, `${monthName(g, m)} of ${g.title} marked unpaid`)}>
              Undo
            </Button>
          ) : null}
        </span>
      </li>
    );
  }

  return (
    <Card
      title="Items"
      subtitle={`What ${p.name} has a part of. Open an item to pay a month, or pay the whole item.`}
      padding="none"
    >
      {error && (
        <p className="cat-editor__error" role="alert">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState heading="No charges yet">Pick {p.name} under "For" when you add a charge or installment, or split one with them.</EmptyState>
      ) : (
        <ul className="bill-list">
          {items.map((g) => {
            const left = g.totalMinor - g.paidMinor;
            const paidMonths = g.months.filter((m) => m.paid).length;
            const lastPayment = g.payments[0];
            return (
              <li key={g.key}>
                <details className={`bill item${left === 0 ? " bill--paid" : ""}`} open={left > 0 && g.months.some((m) => m.pastDue && !m.paid)}>
                  <summary className="bill__head">
                    <span className="bill__when">
                      <strong>{g.title}</strong>
                      <small>
                        {g.plan
                          ? `${g.plan.cardName} · ${g.plan.months} months · ${paidMonths} of ${g.months.length} paid`
                          : `${g.months[0]!.installmentId === null ? "Straight" : "Installment"} · ${shortDate(g.months[0]!.occurredOn)}`}
                      </small>
                      <small>
                        Paid {formatMoney(g.paidMinor)} of {formatMoney(g.totalMinor)}
                        {left > 0 && ` · ${formatMoney(left)} left`}
                      </small>
                    </span>
                    {/* In the header, so a click here mustn't also fold the item open or shut. */}
                    <span className="item__head-action" onClick={(e) => e.preventDefault()}>
                      {left > 0 ? (
                        <Button size="sm" loading={busy === g.key} disabled={busy !== null && busy !== g.key} onClick={() => setConfirm(g)}>
                          Full paid {formatMoney(left)}
                        </Button>
                      ) : lastPayment ? (
                        <Button size="sm" variant="ghost" loading={busy === g.key} onClick={() => remove(g.key, lastPayment, `Last payment for ${g.title} undone`)}>
                          Undo
                        </Button>
                      ) : null}
                    </span>
                  </summary>
                  <div className="bill__body">
                    <ul className="share-list">{g.months.map((m) => renderMonth(g, m))}</ul>
                    {g.plan && (
                      <div className="bill__actions">
                        <a className="link-text item__link" href={`/cards/${g.plan.cardId}`} onClick={linkClick}>
                          Open the plan on {g.plan.cardName}
                        </a>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? `Mark ${confirm.title} as fully paid?` : ""}
        message={
          confirm
            ? `${p.name} paid you ${formatMoney(confirm.totalMinor - confirm.paidMinor)} for ${confirm.title}${confirm.months.some((m) => m.upcoming && !m.paid) ? ", including months not billed yet (paid in advance)" : ""}.`
            : ""
        }
        confirmLabel="Full paid"
        onConfirm={async () => {
          if (confirm) await pay(confirm.key, confirm.totalMinor - confirm.paidMinor, `Paid in full: ${confirm.title}`, confirm.key, `${confirm.title} paid in full`);
        }}
        onClose={() => setConfirm(null)}
      />
    </Card>
  );
}

type PlanMonth = PersonBilling["items"][number] & { dueDate: string; pastDue: boolean; cardName: string | null };


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
                back={{ href: "/people", label: "People" }}
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
              <ItemsCard person={p} onChanged={changed} />


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
