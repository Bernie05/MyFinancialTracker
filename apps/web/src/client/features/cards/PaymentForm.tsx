import { Button, formatMoney, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { newCardPaymentSchema, type CardSummary } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { refreshAlerts } from "../../lib/alerts";
import { todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";

type FieldErrors = Partial<Record<"amountMinor" | "paidOn" | "note", string>>;

/** Record money paid to the card. Prefilled with what's left on the latest statement. */
export function PaymentForm({ card, onSaved, onCancel }: { card: CardSummary; onSaved: (message: string) => void; onCancel: () => void }) {
  const { remainingDueMinor, outstandingMinor } = card.summary;
  const [amount, setAmount] = useState(remainingDueMinor > 0 ? (remainingDueMinor / 100).toFixed(2) : "");
  const [paidOn, setPaidOn] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountMinor = parseAmountToMinor(amount);
  const over = amountMinor !== null && amountMinor > Math.max(0, outstandingMinor);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = newCardPaymentSchema.safeParse({ amountMinor: amountMinor ?? Number.NaN, paidOn, note });
    if (!parsed.success || amountMinor === null) {
      const next: FieldErrors = {};
      if (amountMinor === null) next.amountMinor = "Enter an amount like 12,400.00.";
      for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as keyof FieldErrors] ??= issue.message;
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      await api.addPayment(card.id, parsed.data);
      refreshAlerts();
      onSaved(`Payment of ${formatMoney(parsed.data.amountMinor)} recorded`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <p className="cat-editor__hint">
        {remainingDueMinor > 0
          ? `${formatMoney(remainingDueMinor)} is left on the statement. A payment isn't an expense: your spending was already counted.`
          : "Nothing is due right now. A payment here becomes credit on the card."}
      </p>
      <TextField
        label="Amount"
        prefix="₱"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amountMinor}
        hint={over ? `That's more than the ${formatMoney(Math.max(0, outstandingMinor))} you owe; the extra stays as credit.` : undefined}
        data-autofocus
      />
      <TextField label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} />
      <TextField label="Note" hint="Optional" maxLength={200} placeholder="Online banking" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
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
          Record payment
        </Button>
      </div>
    </form>
  );
}
