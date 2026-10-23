import { Button, Select, TextField } from "@mft/ui";
import { useMemo, useState, type FormEvent } from "react";
import { newTransactionSchema, type Card, type Category, type TransactionType } from "../../../shared/contracts";
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
  /** Called after a successful save, so the page can refresh its lists. */
  onAdded: (message: string) => void;
}

type FieldErrors = Partial<Record<"amountMinor" | "description" | "categoryId" | "occurredOn" | "cardId", string>>;

export function AddTransactionForm({ type, categories, cards = [], defaultCardId, onAdded }: AddTransactionFormProps) {
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayLocal);
  const [paidWith, setPaidWith] = useState(defaultCardId ? String(defaultCardId) : ""); // "" = cash or debit, else a card id
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const noun = type === "expense" ? "expense" : "income";
  const selectedCategory = options.find((c) => String(c.id) === categoryId);
  const selectedCard = cards.find((c) => String(c.id) === paidWith);

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
      cardId: type === "expense" && paidWith ? Number(paidWith) : null,
    });

    if (!parsed.success || amountMinor === null) {
      const next: FieldErrors = {};
      if (amountMinor === null) next.amountMinor = "Enter an amount like 1,250.50.";
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
      await api.createTransaction(parsed.data);
      setAmountText("");
      setDescription("");
      onAdded(type === "expense" ? "Expense added" : "Income added");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields as FieldErrors);
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
          id="add-amount"
          label="Amount"
          prefix="₱"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          error={errors.amountMinor}
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

      {type === "expense" && cards.length > 0 && (
        <Select
          label="Paid with"
          value={paidWith}
          onChange={(e) => setPaidWith(e.target.value)}
          error={errors.cardId}
          prefix={selectedCard && <ColorDot color={categoryColor(selectedCard.color)} />}
          options={[
            { value: "", label: "Cash or debit" },
            ...cards.map((c) => ({ value: String(c.id), label: c.last4 ? `${c.name} ••${c.last4}` : c.name })),
          ]}
        />
      )}

      {formError && (
        <p className="add-form__error" role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" loading={saving} fullWidth>
        Add {noun}
      </Button>
    </form>
  );
}
