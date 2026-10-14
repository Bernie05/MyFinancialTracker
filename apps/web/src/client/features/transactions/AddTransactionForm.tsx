import { Button, SegmentedControl, TextField } from "@mft/ui";
import { useId, useMemo, useState, type FormEvent } from "react";
import { newTransactionSchema, type Category, type TransactionType } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";

interface AddTransactionFormProps {
  categories: Category[];
  /** Called after a successful save, so the page can refresh its lists. */
  onAdded: (message: string) => void;
}

type FieldErrors = Partial<Record<"amountMinor" | "description" | "categoryId" | "occurredOn", string>>;

const typeOptions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

export function AddTransactionForm({ categories, onAdded }: AddTransactionFormProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayLocal);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectId = useId();

  const options = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const noun = type === "expense" ? "expense" : "income";

  function changeType(next: TransactionType) {
    setType(next);
    setCategoryId(""); // a category belongs to one type; don't carry it across
    setErrors({});
  }

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
      <SegmentedControl aria-label="Transaction type" options={typeOptions} value={type} onChange={changeType} />

      <div className="add-form__grid">
        <TextField
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

      {/* Native select styled with tokens; a design-system Select is a planned addition. */}
      <div className={`app-select${errors.categoryId ? " app-select--error" : ""}`}>
        <label htmlFor={selectId}>Category</label>
        <select
          id={selectId}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-invalid={errors.categoryId ? true : undefined}
          aria-describedby={errors.categoryId ? `${selectId}-error` : undefined}
        >
          <option value="">Choose a category</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.categoryId && <p id={`${selectId}-error`}>{errors.categoryId}</p>}
      </div>

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
