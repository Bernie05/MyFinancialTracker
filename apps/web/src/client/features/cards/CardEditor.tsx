import { Button, Select, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { categoryColorPresets, colorOwner, newCardSchema, type CardSummary } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorPicker } from "../../layout/ColorPicker";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { refreshAlerts } from "../../lib/alerts";
import { parseAmountToMinor } from "../../lib/parseAmount";
import { usePeople } from "../people/SplitField";
import { CardFace } from "./CardFace";

interface CardEditorProps {
  card: CardSummary | null;
  /** All cards, to keep colors unique among them. */
  all: CardSummary[];
  onSaved: (message: string, id: number) => void;
  onDeleted?: (message: string) => void;
  onCancel: () => void;
}

type Field = "name" | "issuer" | "last4" | "limitMinor" | "closingDay" | "dueDay" | "notifyDays" | "color" | "installmentRates" | "defaultPersonId";
type FieldErrors = Partial<Record<Field, string>>;

const pesos = (minor: number) => (minor / 100).toFixed(2);

/** One editable line of the rate table (strings while typing). */
interface RateRow {
  key: number;
  months: string;
  rate: string;
}
const COMMON_TERMS = [3, 6, 9, 12, 18, 24, 36];
let nextKey = 1;
const rateRow = (months: number | string, rate: number | string): RateRow => ({ key: nextKey++, months: String(months), rate: String(rate) });

/** Add or edit a card: identity, limit, statement and due days, reminder days, color, archive. */
export function CardEditor({ card, all, onSaved, onDeleted, onCancel }: CardEditorProps) {
  const others = all.filter((c) => c.id !== card?.id);
  const firstFree = categoryColorPresets.find((k) => !colorOwner(others, k));
  const [name, setName] = useState(card?.name ?? "");
  const [issuer, setIssuer] = useState(card?.issuer ?? "");
  const [last4, setLast4] = useState(card?.last4 ?? "");
  const [limit, setLimit] = useState(card ? pesos(card.limitMinor) : "");
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? ""));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? ""));
  const [notifyDays, setNotifyDays] = useState(String(card?.notifyDays ?? 3));
  const [color, setColor] = useState(card?.color ?? firstFree ?? "#c0392b");
  const [archived, setArchived] = useState(card?.archived ?? false);
  const [usualPerson, setUsualPerson] = useState(card?.defaultPersonId ? String(card.defaultPersonId) : "");
  const { people } = usePeople();
  const [rates, setRates] = useState<RateRow[]>(() => (card?.installmentRates ?? []).map((r) => rateRow(r.months, r.addOnRateBps / 100)));
  /** Per rate row (by key): the message to show under it. */
  const [rateErrors, setRateErrors] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});

  function addRate() {
    const used = new Set(rates.map((r) => Number(r.months)));
    const last = Math.max(0, ...used);
    const months = COMMON_TERMS.find((t) => t > last && !used.has(t)) ?? COMMON_TERMS.find((t) => !used.has(t)) ?? "";
    setRates([...rates, rateRow(months, "0")]);
  }
  const changeRate = (key: number, patch: Partial<RateRow>) => setRates(rates.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRate = (key: number) => setRates(rates.filter((r) => r.key !== key));
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const limitMinor = parseAmountToMinor(limit);
    // Fully blank rate lines are dropped; a blank rate on a filled line is an error, not a silent 0%.
    const filled = rates.filter((r) => r.months.trim() !== "" || r.rate.trim() !== "");
    const rowErrors: Record<number, string> = {};
    const installmentRates = filled.map((r) => {
      const rate = r.rate.replace(/[%\s]/g, "");
      if (rate === "" || !Number.isFinite(Number(rate))) rowErrors[r.key] = "Enter a rate like 0.79, or 0.";
      return { months: r.months.trim() === "" ? Number.NaN : Number(r.months), addOnRateBps: Math.round(Number(rate) * 100) };
    });
    const parsed = newCardSchema.safeParse({
      installmentRates,
      defaultPersonId: usualPerson ? Number(usualPerson) : null,
      name,
      issuer,
      last4,
      limitMinor: limitMinor ?? Number.NaN,
      closingDay,
      dueDay,
      notifyDays,
      color,
    });
    const next: FieldErrors = {};
    if (limitMinor === null) next.limitMinor = "Enter a limit like 150,000.";
    const clash = colorOwner(others, color);
    if (clash) next.color = `${clash.name} already uses this color. Pick another.`;
    for (const issue of parsed.error?.issues ?? []) {
      if (issue.path[0] === "installmentRates") {
        const row = typeof issue.path[1] === "number" ? filled[issue.path[1]] : undefined;
        if (row) rowErrors[row.key] ??= issue.path[2] === "months" && Number.isNaN(installmentRates[issue.path[1] as number]!.months) ? "Enter the months." : issue.message;
        else next.installmentRates ??= issue.message;
      } else next[issue.path[0] as Field] ??= issue.message;
    }
    setRateErrors(rowErrors);
    if (!parsed.success || Object.keys(next).length > 0 || Object.keys(rowErrors).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = card ? await api.updateCard(card.id, { ...parsed.data, archived }) : await api.createCard(parsed.data);
      refreshAlerts(); // notify days, due day or archiving can change what's alerting
      onSaved(card ? `${saved.name} saved` : `${saved.name} added`, saved.id);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        // "installmentRates.2.months" → under that rate line.
        const fromServer: FieldErrors = {};
        const rows: Record<number, string> = {};
        for (const [path, message] of Object.entries(err.fields)) {
          const [field, index] = path.split(".");
          const row = index !== undefined ? filled[Number(index)] : undefined;
          if (field === "installmentRates" && row) rows[row.key] = message;
          else fromServer[field as Field] = message;
        }
        setErrors(fromServer);
        setRateErrors(rows);
      } else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasCharges = (card?.transactionCount ?? 0) > 0;

  // A card with charges is archived instead of deleted, so its history stays (the API enforces this too).
  async function removeOrArchive() {
    if (!card) return;
    if (hasCharges) {
      const saved = await api.updateCard(card.id, { archived: true });
      refreshAlerts();
      onSaved(`${card.name} archived`, saved.id);
    } else {
      await api.deleteCard(card.id);
      refreshAlerts();
      onDeleted?.(`${card.name} deleted`);
    }
  }

  const notify = Number(notifyDays);
  const preview = { id: 0, name: name.trim() || "Card name", issuer: issuer.trim() || null, last4: /^\d{4}$/.test(last4) ? last4 : null, color: /^#[0-9a-fA-F]{6}$|^[a-z]+$/.test(color) ? color : "grey", limitMinor: 0, closingDay: 1, dueDay: 1, notifyDays: 0, archived: false, installmentRates: [], defaultPersonId: null };

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <div className="card-editor__preview">
        <CardFace card={preview} />
      </div>
      <TextField label="Name" placeholder="BPI Gold" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} data-autofocus />
      <div className="add-form__grid">
        <TextField label="Bank" hint="Optional" placeholder="BPI" maxLength={40} value={issuer} onChange={(e) => setIssuer(e.target.value)} error={errors.issuer} />
        <TextField
          label="Last 4 digits"
          hint="Optional. Never your full number."
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder="4821"
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
          error={errors.last4}
        />
      </div>
      <TextField label="Credit limit" prefix="₱" inputMode="decimal" placeholder="150,000.00" value={limit} onChange={(e) => setLimit(e.target.value)} error={errors.limitMinor} />
      <div className="add-form__grid">
        <TextField
          label="Statement day"
          hint="Day of the month it closes"
          type="number"
          min={1}
          max={31}
          value={closingDay}
          onChange={(e) => setClosingDay(e.target.value)}
          error={errors.closingDay}
        />
        <TextField
          label="Payment due day"
          hint="31 means the month's last day"
          type="number"
          min={1}
          max={31}
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          error={errors.dueDay}
        />
      </div>
      <TextField
        label="Remind me"
        suffix="days before"
        type="number"
        min={0}
        max={30}
        value={notifyDays}
        onChange={(e) => setNotifyDays(e.target.value)}
        error={errors.notifyDays}
        hint={
          Number.isInteger(notify) && notify >= 0 && notify <= 30
            ? notify === 0
              ? "You'll see a reminder on the due date."
              : `You'll see a reminder from ${notify} day${notify === 1 ? "" : "s"} before the due date until it's paid.`
            : undefined
        }
      />
      <ColorPicker value={color} onChange={setColor} taken={others} noun="card" error={errors.color} />

      <Select
        label="Usually used by"
        hint="New charges and installments on this card start out as theirs. You can still change each one."
        value={usualPerson}
        onChange={(e) => setUsualPerson(e.target.value)}
        error={errors.defaultPersonId}
        options={[
          { value: "", label: "Me" },
          ...people.filter((p) => !p.archived || String(p.id) === usualPerson).map((p) => ({ value: String(p.id), label: p.name })),
        ]}
      />

      <fieldset className="card-rates">
        <legend>Installment rates</legend>
        <p className="card-rates__hint">
          The terms this card offers and their add-on rate. Adding an installment on this card fills in the rate for the term you pick.
        </p>
        {rates.length > 0 && (
          <ul className="card-rates__list">
            {rates.map((r, i) => (
              <li key={r.key} className="card-rates__row">
                <TextField
                  label="Months"
                  type="number"
                  min={1}
                  max={60}
                  value={r.months}
                  onChange={(e) => changeRate(r.key, { months: e.target.value })}
                  aria-label={`Term ${i + 1}: months`}
                />
                <TextField
                  label="Add-on rate"
                  suffix="% a month"
                  inputMode="decimal"
                  value={r.rate}
                  onChange={(e) => changeRate(r.key, { rate: e.target.value })}
                  aria-label={`Term ${i + 1}: add-on rate, percent a month`}
                />
                <Button type="button" variant="ghost" size="sm" className="card-rates__remove" onClick={() => removeRate(r.key)} aria-label={`Remove the ${r.months || "blank"}-month term`}>
                  Remove
                </Button>
                {rateErrors[r.key] && (
                  <p className="card-rates__error" role="alert">
                    {rateErrors[r.key]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {errors.installmentRates && (
          <p className="card-rates__error" role="alert">
            {errors.installmentRates}
          </p>
        )}
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={addRate} disabled={rates.length >= 24}>
            + Add term
          </Button>
        </div>
      </fieldset>

      {card && (
        <label className="checkbox">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          <span>
            Archived
            <small>Hidden from "Paid with" and reminders. Its history stays.</small>
          </span>
        </label>
      )}

      {formError && (
        <p className="cat-editor__error" role="alert">
          {formError}
        </p>
      )}

      <div className="dialog__actions">
        {card && !card.archived && (
          <Button type="button" variant="ghost" className="dialog__left" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete card
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {card ? "Save card" : "Add card"}
        </Button>
      </div>
      {card && (
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete “${card.name}”?`}
          message={
            hasCharges
              ? `${card.name} has ${card.transactionCount} charge${card.transactionCount === 1 ? "" : "s"}, so deleting it would erase that history. Archive it instead: it leaves "Paid with" and reminders, and its history stays.`
              : `${card.name} has no charges. Its payments and installment plans are deleted with it.`
          }
          confirmLabel={hasCharges ? "Archive card" : "Delete card"}
          onConfirm={removeOrArchive}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </form>
  );
}
