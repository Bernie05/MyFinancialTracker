import { Button, formatMoney, Select, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { newInstallmentSchema, type CardSummary, type Category, type Installment } from "../../../shared/contracts";
import { defaultFirstBillingMonth, installmentSchedule } from "../../../shared/installments";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { categoryColor } from "../../lib/categoryColor";
import { categoryOptions } from "../../lib/categoryOptions";
import { monthLabel, todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";

type Field = "description" | "categoryId" | "purchasedOn" | "principalMinor" | "months" | "addOnRateBps" | "amortizationMinor" | "feeMinor" | "firstBillingMonth";
type FieldErrors = Partial<Record<Field, string>>;

const TERMS = ["3", "6", "9", "12", "18", "24", "36"];
const pesos = (minor: number | null | undefined) => (minor ? (minor / 100).toFixed(2) : "");

interface InstallmentEditorProps {
  card: CardSummary;
  plan: Installment | null;
  categories: Category[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/** Add or edit a plan, with a live preview of the monthly amount, interest and end month. */
export function InstallmentEditor({ card, plan, categories, onSaved, onCancel }: InstallmentEditorProps) {
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [categoryId, setCategoryId] = useState(plan ? String(plan.category.id) : "");
  const [purchasedOn, setPurchasedOn] = useState(plan?.purchasedOn ?? todayLocal());
  const [principal, setPrincipal] = useState(pesos(plan?.principalMinor));
  const [term, setTerm] = useState(plan ? (TERMS.includes(String(plan.months)) ? String(plan.months) : "custom") : "12");
  const [customMonths, setCustomMonths] = useState(plan && !TERMS.includes(String(plan.months)) ? String(plan.months) : "");
  const [rate, setRate] = useState(plan ? String(plan.addOnRateBps / 100) : "0");
  const [override, setOverride] = useState(pesos(plan?.amortizationMinor));
  const [fee, setFee] = useState(pesos(plan?.feeMinor));
  // Empty = "next statement after the purchase", worked out from the purchase date.
  const [firstMonth, setFirstMonth] = useState(plan?.firstBillingMonth ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const months = Number(term === "custom" ? customMonths : term);
  const principalMinor = parseAmountToMinor(principal);
  const rateBps = rate.trim() === "" ? 0 : Math.round(Number(rate) * 100);
  const overrideMinor = override.trim() ? parseAmountToMinor(override) : null;
  const feeMinor = fee.trim() ? parseAmountToMinor(fee) : 0;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(purchasedOn);
  const billingMonth = firstMonth || (validDate ? defaultFirstBillingMonth(purchasedOn, card.closingDay) : "");

  const preview =
    principalMinor && Number.isInteger(months) && months >= 1 && months <= 60 && Number.isFinite(rateBps) && rateBps >= 0 && billingMonth
      ? installmentSchedule(
          { principalMinor, months, addOnRateBps: rateBps, amortizationMinor: overrideMinor, feeMinor: feeMinor ?? 0, firstBillingMonth: billingMonth, preterminatedOn: null },
          card.closingDay,
          todayLocal(),
        )
      : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input = {
      description,
      categoryId: Number(categoryId) || 0,
      purchasedOn,
      principalMinor: principalMinor ?? Number.NaN,
      months,
      addOnRateBps: rateBps,
      amortizationMinor: override.trim() ? (overrideMinor ?? Number.NaN) : null,
      feeMinor: fee.trim() ? (feeMinor ?? Number.NaN) : 0,
      firstBillingMonth: billingMonth || undefined,
    };
    const parsed = newInstallmentSchema.safeParse(input);
    const next: FieldErrors = {};
    if (principalMinor === null) next.principalMinor = "Enter an amount like 83,990.00.";
    if (!Number.isFinite(rateBps)) next.addOnRateBps = "Enter a rate like 0.79, or 0.";
    for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as Field] ??= issue.message;
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // Keep a pre-termination when editing other terms; it's changed from the Pre-terminate action.
      if (plan) await api.updateInstallment(plan.id, { ...parsed.data, firstBillingMonth: billingMonth, preterminatedOn: plan.preterminatedOn });
      else await api.createInstallment(card.id, parsed.data);
      onSaved(plan ? `${parsed.data.description} saved` : `${parsed.data.description} added`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  const selectedCategory = expenseCategories.find((c) => String(c.id) === categoryId);

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <TextField label="What did you buy?" placeholder="iPhone 16 Pro (Power Mac)" maxLength={80} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} data-autofocus />
      <div className="add-form__grid">
        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          error={errors.categoryId}
          prefix={selectedCategory && <ColorDot color={categoryColor(selectedCategory.color)} />}
          options={[{ value: "", label: "Choose a category" }, ...categoryOptions(categories, "expense")]}
        />
        <TextField label="Purchase date" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} error={errors.purchasedOn} />
      </div>
      <div className="add-form__grid">
        <TextField label="Price (principal)" prefix="₱" inputMode="decimal" placeholder="83,990.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} error={errors.principalMinor} />
        <Select
          label="Term"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          options={[...TERMS.map((t) => ({ value: t, label: `${t} months` })), { value: "custom", label: "Custom" }]}
        />
      </div>
      {term === "custom" && (
        <TextField label="Months" type="number" min={1} max={60} value={customMonths} onChange={(e) => setCustomMonths(e.target.value)} error={errors.months} />
      )}
      <div className="add-form__grid">
        <TextField
          label="Add-on rate"
          suffix="% a month"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={errors.addOnRateBps}
          hint="0 for a 0% plan"
        />
        <TextField
          label="Bank's monthly amount"
          prefix="₱"
          inputMode="decimal"
          placeholder={preview && !overrideMinor ? (preview.monthlyMinor / 100).toFixed(2) : "Optional"}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          error={errors.amortizationMinor}
          hint="Only if your statement shows a different figure"
        />
      </div>
      <div className="add-form__grid">
        <TextField label="Processing fee" prefix="₱" inputMode="decimal" placeholder="Optional" value={fee} onChange={(e) => setFee(e.target.value)} error={errors.feeMinor} hint="Billed once, with month 1" />
        <TextField
          label="First billed on"
          type="month"
          value={billingMonth}
          onChange={(e) => setFirstMonth(e.target.value)}
          error={errors.firstBillingMonth}
          hint="Defaults to the next statement"
        />
      </div>

      <section className="inst-preview" aria-label="Preview" aria-live="polite">
        {preview ? (
          <>
            <div>
              <span>Monthly</span>
              <strong>{formatMoney(preview.monthlyMinor)}</strong>
            </div>
            <div>
              <span>Total interest</span>
              <strong>{formatMoney(preview.interestMinor)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatMoney(preview.totalMinor)}</strong>
            </div>
            <div>
              <span>Last payment</span>
              <strong>{monthLabel(preview.endsOn.slice(0, 7))}</strong>
            </div>
          </>
        ) : (
          <p>Enter the price and term to see the monthly amount.</p>
        )}
      </section>

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
          {plan ? "Save installment" : "Add installment"}
        </Button>
      </div>
    </form>
  );
}
