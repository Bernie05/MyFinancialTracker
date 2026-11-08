import { Amount, Button, formatMoney, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { newPersonSchema, type PersonSummary } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { Dialog } from "../../layout/Dialog";
import { EmptyState } from "../../layout/EmptyState";
import { PeopleIcon, PlusIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { shortDate } from "../../lib/dates";
import { linkClick } from "../../lib/router";
import { useAsync } from "../../lib/useAsync";

/** Add or rename someone. */
export function PersonForm({ person, onSaved, onCancel }: { person?: PersonSummary; onSaved: (p: PersonSummary) => void; onCancel: () => void }) {
  const [name, setName] = useState(person?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = newPersonSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Add a name.");
      return;
    }
    setBusy(true);
    try {
      onSaved(person ? await api.updatePerson(person.id, parsed.data) : await api.createPerson(parsed.data));
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.name ?? err.message) : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <TextField label="Name" placeholder="Ana" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} error={error ?? undefined} data-autofocus />
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {person ? "Save" : "Add person"}
        </Button>
      </div>
    </form>
  );
}

/** "₱2,000 straight · ₱1,500/mo on 2 installments", or "No charges yet". */
function breakdown(p: PersonSummary) {
  const parts = [];
  if (p.straightMinor > 0) parts.push(`${formatMoney(p.straightMinor)} straight`);
  if (p.activePlans > 0) parts.push(`${formatMoney(p.monthlyMinor)}/mo on ${p.activePlans} installment${p.activePlans === 1 ? "" : "s"}`);
  else if (p.installmentBilledMinor > 0) parts.push(`${formatMoney(p.installmentBilledMinor)} installments`);
  return parts.length ? parts.join(" · ") : p.shareCount === 0 ? "No charges yet" : "All settled";
}

function PersonRow({ person }: { person: PersonSummary }) {
  const total = person.toPayOffMinor;
  return (
    <li>
      <a className="person-row" href={`/people/${person.id}`} onClick={linkClick}>
        <span className="person-row__avatar" aria-hidden="true">
          {person.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="person-row__name">
          {person.name}
          <small>{breakdown(person)}</small>
        </span>
        <span className="person-row__balance">
          <small>{total > 0 ? "To pay off" : total < 0 ? "You owe them" : "Settled"}</small>
          <Amount minorUnits={Math.abs(total)} tone="neutral" />
          {person.overdueMinor > 0 ? (
            <small className="person-row__overdue">{formatMoney(person.overdueMinor)} unpaid, past due</small>
          ) : person.nextDue ? (
            <small>
              {formatMoney(person.nextDue.amountMinor)} due {shortDate(person.nextDue.dueDate)}
            </small>
          ) : null}
        </span>
      </a>
    </li>
  );
}

/** Everyone whose charges go on your cards, and what each owes you. */
export function PeoplePage() {
  const list = useAsync(() => api.listPeople(), []);
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <PageHeader
        title="People"
        subtitle="Friends and family who use your cards, and what they owe you"
        actions={
          <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
            Add person
          </Button>
        }
      />
      <Loadable state={list.state} reload={list.reload} what="people" skeleton="rows">
        {(people) => {
          const active = people.filter((p) => !p.archived);
          const archived = people.filter((p) => p.archived);
          const owed = active.reduce((sum, p) => sum + Math.max(0, p.balanceMinor), 0);
          const toCome = active.reduce((sum, p) => sum + p.upcomingMinor, 0);
          const monthly = active.reduce((sum, p) => sum + p.monthlyMinor, 0);
          if (people.length === 0) {
            return (
              <section className="panel panel--empty" aria-label="No people yet">
                <EmptyState
                  icon={<PeopleIcon />}
                  heading="No one added yet"
                  action={
                    <Button iconStart={<PlusIcon />} onClick={() => setAdding(true)}>
                      Add person
                    </Button>
                  }
                >
                  Add the people who use your cards. Then pick them under "For" on a charge or installment, or split a charge between you,
                  and see what each one owes.
                </EmptyState>
              </section>
            );
          }
          return (
            <>
              <section className="cards-total" aria-label="Totals">
                <div>
                  <span className="card-tile__label">Owed to you now</span>
                  <Amount minorUnits={owed} size="lg" tone="neutral" />
                </div>
                <div>
                  <span className="card-tile__label">Installments still to come</span>
                  <strong className="cards-total__next">
                    {formatMoney(toCome)}
                    {monthly > 0 && ` · ${formatMoney(monthly)}/mo`}
                  </strong>
                </div>
              </section>
              <section className="panel">
                <ul className="person-list">{active.map((p) => <PersonRow key={p.id} person={p} />)}</ul>
              </section>
              {archived.length > 0 && (
                <details className="archived">
                  <summary>Archived ({archived.length})</summary>
                  <section className="panel">
                    <ul className="person-list">{archived.map((p) => <PersonRow key={p.id} person={p} />)}</ul>
                  </section>
                </details>
              )}
            </>
          );
        }}
      </Loadable>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add person">
        {adding && (
          <PersonForm
            onSaved={() => {
              setAdding(false);
              list.reload();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
