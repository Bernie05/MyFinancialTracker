import { Button, Select, TextField } from "@mft/ui";
import { useMemo, useState, type FormEvent } from "react";
import { newTransactionSchema, type Card, type Category, type SplitInput, type Transaction, type TransactionType } from "../../../shared/contracts";
import { normalizeSplit } from "../../../shared/split";
import { SplitField, splitProblem, usePeople } from "../people/SplitField";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { categoryColor } from "../../lib/categoryColor";
import { categoryOptions } from "../../lib/categoryOptions";
import { todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";

interface AddTransactionFormProps {
  /** The page decides the type: Expenses adds expenses, Income adds income. */
  type: TransactionType;
  categories: Category[];
  /** Active credit cards for "Paid with" (expenses only). */
  cards?: Card[];
  /** Start with this card under "Paid with" (e.g. "Add charge" on a card page). */
  defaultCardId?: number;
  /**
   * Whether "Cash or debit" is offered under "Paid with". A section limits the choices to its own:
   * a card page passes only cards of its kind with this off; Cash & Others passes no cards.
   */
  allowCash?: boolean;
  /** Edit this transaction instead of adding one: fields start filled in, and saving updates it. */
  transaction?: Transaction;
  /** Called after a successful save, so the page can refresh its lists. */
  onAdded: (message: string) => void;
}

type FieldErrors = Partial<Record<"amountMinor" | "description" | "categoryId" | "occurredOn" | "note" | "cardId" | "split", string>>;

/** A card's usual person as a split ("all theirs"), or null for you. */
const usualFor = (card: Card | undefined): SplitInput | null =>
  card?.defaultPersonId ? { mode: "equal", parts: [{ personId: card.defaultPersonId, value: 1 }] } : null;

/** Adds a transaction, or edits one when `transaction` is given (same fields, same validation). */
export function AddTransactionForm({ type, categories, cards = [], defaultCardId, allowCash = true, transaction: tx, onAdded }: AddTransactionFormProps) {
  const [amountText, setAmountText] = useState(tx ? (tx.amountMinor / 100).toFixed(2) : "");
  const [description, setDescription] = useState(tx?.description ?? "");
  const [categoryId, setCategoryId] = useState(tx ? String(tx.category.id) : "");
  const [occurredOn, setOccurredOn] = useState(tx?.occurredOn ?? todayLocal());
  const [note, setNote] = useState(tx?.note ?? "");
  // "" = cash or debit, else a card id.
  const [paidWith, setPaidWith] = useState(
    tx?.card ? String(tx.card.id) : defaultCardId ? String(defaultCardId) : !allowCash && cards[0] ? String(cards[0].id) : "",
  );
  // Who it's for. A new charge starts with the card's usual person, until you choose yourself.
  const [split, setSplit] = useState<SplitInput | null>(() => (tx ? tx.split : usualFor(cards.find((c) => c.id === defaultCardId))));
  const [splitTouched, setSplitTouched] = useState(false);
  const { people, reload: reloadPeople } = usePeople();
  const [errors, setErrors] = useState<FieldErrors>({});

  function choosePaidWith(value: string) {
    setPaidWith(value);
    if (!tx && !splitTouched) setSplit(usualFor(cards.find((c) => String(c.id) === value)));
  }
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const noun = type === "expense" ? "expense" : "income";
  const selectedCategory = options.find((c) => String(c.id) === categoryId);
  // An edited charge may sit on a card that's since been archived: keep it selectable.
  const cardChoices = tx?.card && !cards.some((c) => c.id === tx.card!.id) ? [...cards, { ...tx.card } as Card] : cards;
  const selectedCard = cardChoices.find((c) => String(c.id) === paidWith);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const amountMinor = parseAmountToMinor(amountText);
    // Validate with the same schema the server uses; the server still re-checks.
    const parsed = newTransactionSchema.safeParse({
      type,
      amountMinor: amountMinor ?? Number.NaN,
      description,
      categoryId: Number(categoryId) || 0,
      occurredOn,
      note,
      cardId: type === "expense" && paidWith ? Number(paidWith) : null,
      split: type === "expense" ? normalizeSplit(split) : null,
    });
    const problem = type === "expense" ? splitProblem(split, amountMinor) : undefined;

    if (!parsed.success || amountMinor === null || problem) {
      const next: FieldErrors = {};
      if (amountMinor === null) next.amountMinor = "Enter an amount like 1,250.50.";
      if (problem) next.split = problem;
      for (const issue of parsed.error?.issues ?? []) {
        const key = issue.path[0] as keyof FieldErrors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      if (tx) {
        const { type: _type, ...changes } = parsed.data;
        await api.updateTransaction(tx.id, changes);
        onAdded(`${parsed.data.description} saved`);
      } else {
        await api.createTransaction(parsed.data);
        setAmountText("");
        setDescription("");
        setNote("");
        setSplit(usualFor(cards.find((c) => String(c.id) === paidWith)));
        setSplitTouched(false);
        onAdded(type === "expense" ? "Expense added" : "Income added");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // "split.parts.1.value" and friends all show under the For field.
        setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.startsWith("split") ? "split" : k, v])) as FieldErrors);
        if (Object.keys(err.fields).length === 0) setFormError(err.message);
      } else {
        setFormError("Couldn't save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-form" onSubmit={onSubmit} noValidate>
      <div className="add-form__grid">
        <TextField
          id={tx ? undefined : "add-amount"}
          label="Amount"
          prefix="₱"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amountMinor}
          data-autofocus
        />
        <TextField
          label="Date"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          error={errors.occurredOn}
        />
      </div>

      <TextField
        label="Description"
        placeholder={type === "expense" ? "Puregold Cubao" : "October salary"}
        maxLength={120}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={errors.description}
      />

      <Select
        label="Category"
        value={categoryId}
        prefix={selectedCategory && <ColorDot color={categoryColor(selectedCategory.color)} />}
        onChange={(e) => setCategoryId(e.target.value)}
        error={errors.categoryId}
        options={[{ value: "", label: "Choose a category" }, ...categoryOptions(categories, type)]}
      />

      {type === "expense" && cardChoices.length === 0 && allowCash && <TextField label="Paid with" value="Cash or debit" readOnly />}

      {type === "expense" && cardChoices.length > 0 && (
        <Select
          label="Paid with"
          value={paidWith}
          onChange={(e) => choosePaidWith(e.target.value)}
          error={errors.cardId}
          prefix={selectedCard && <ColorDot color={categoryColor(selectedCard.color)} />}
          options={[
            // An edited cash expense keeps "Cash or debit" even where the section is cards only.
            ...(allowCash || (tx && !tx.card) ? [{ value: "", label: "Cash or debit" }] : []),
            ...cardChoices.map((c) => ({ value: String(c.id), label: c.last4 ? `${c.name} ••${c.last4}` : c.name })),
          ]}
        />
      )}

      {type === "expense" && (
        <SplitField
          value={split}
          onChange={(next) => {
            setSplit(next);
            setSplitTouched(true);
          }}
          amountMinor={parseAmountToMinor(amountText)}
          people={people}
          onPersonAdded={reloadPeople}
          error={errors.split}
        />
      )}

      <TextField label="Note" hint="Optional" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />

      {formError && (
        <p className="add-form__error" role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" loading={saving} fullWidth>
        {tx ? "Save changes" : `Add ${noun}`}
      </Button>
    </form>
  );
}
