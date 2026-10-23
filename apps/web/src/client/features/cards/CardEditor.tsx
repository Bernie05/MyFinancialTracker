import { Button, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { categoryColorPresets, colorOwner, newCardSchema, type CardSummary } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorPicker } from "../../layout/ColorPicker";
import { ConfirmDialog } from "../../layout/ConfirmDialog";
import { refreshAlerts } from "../../lib/alerts";
import { parseAmountToMinor } from "../../lib/parseAmount";
import { CardFace } from "./CardFace";

interface CardEditorProps {
  card: CardSummary | null;
  /** All cards, to keep colors unique among them. */
  all: CardSummary[];
  onSaved: (message: string, id: number) => void;
  onDeleted?: (message: string) => void;
  onCancel: () => void;
}

type Field = "name" | "issuer" | "last4" | "limitMinor" | "closingDay" | "dueDay" | "notifyDays" | "color";
type FieldErrors = Partial<Record<Field, string>>;

const pesos = (minor: number) => (minor / 100).toFixed(2);

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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const limitMinor = parseAmountToMinor(limit);
    const parsed = newCardSchema.safeParse({
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
    for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as Field] ??= issue.message;
    if (!parsed.success || Object.keys(next).length > 0) {
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
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
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
  const preview = { id: 0, name: name.trim() || "Card name", issuer: issuer.trim() || null, last4: /^\d{4}$/.test(last4) ? last4 : null, color: /^#[0-9a-fA-F]{6}$|^[a-z]+$/.test(color) ? color : "grey", limitMinor: 0, closingDay: 1, dueDay: 1, notifyDays: 0, archived: false };

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
