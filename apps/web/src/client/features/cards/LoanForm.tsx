import { Button, formatMoney, Select, TextField } from "@mft/ui";
import { useMemo, useState, type FormEvent } from "react";
import { loanTypeLabels, type CardSummary, type Category, type LoanType } from "../../../shared/contracts";
import { installmentSchedule } from "../../../shared/installments";
import { billingMonthFor, firstDueDate } from "../../../shared/loans";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { refreshAlerts } from "../../lib/alerts";
import { categoryOptions } from "../../lib/categoryOptions";
import { shortDate, todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";

type Field = "description" | "categoryId" | "purchasedOn" | "principalMinor" | "months" | "firstDue";
const TERMS = [3, 6, 9, 12, 18, 24, 36];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The account's next due date after today: a sensible first payment. */
function nextDueDay(today: string, dueDay: number) {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const month = d < dueDay ? m - 1 : m; // 0-based month of the next due date
  const last = new Date(y, month + 1, 0).getDate();
  const next = new Date(y, month, Math.min(dueDay, last));
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** The loan type comes from where it's added: an online credit account makes an online loan, a bank card a bank credit loan. */
const loanTypeFor = (card: CardSummary): LoanType => (card.kind === "online" ? "online" : "bank");

/**
 * Add a loan to this account: what it's for, the category, how much, when, for how many months and when
 * the first payment is due. It's stored as an installment plan marked with its loan type, so the unpaid
 * amount comes off the account's available credit and each month is billed as an expense.
 */
export function LoanForm({ card, categories, onSaved, onCancel }: {
  card: CardSummary;
  categories: Category[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const today = todayLocal();
  const expenseOptions = categoryOptions(categories, "expense");
  const defaultCategory =
    categories.find((c) => c.type === "expense" && c.parentId === null && /loan|debt/i.test(c.name)) ??
    categories.find((c) => c.type === "expense" && c.parentId === null && /shopping/i.test(c.name));

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategory ? String(defaultCategory.id) : (expenseOptions[0]?.value ?? ""));
  const [purchasedOn, setPurchasedOn] = useState(today);
  const [principal, setPrincipal] = useState("");
  const [months, setMonths] = useState("12");
  const [firstDue, setFirstDue] = useState(nextDueDay(today, card.dueDay));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A live summary, computed exactly as the plan will bill it.
  const preview = useMemo(() => {
    const principalMinor = parseAmountToMinor(principal);
    const n = Number(months);
    if (!principalMinor || !Number.isInteger(n) || n < 1 || n > 60 || !DATE.test(purchasedOn) || !DATE.test(firstDue) || firstDue <= purchasedOn) return null;
    const billing = billingMonthFor(firstDue, purchasedOn, card);
    const terms = { principalMinor, months: n, addOnRateBps: 0, amortizationMinor: null, feeMinor: 0, firstBillingMonth: billing, purchasedOn, preterminatedOn: null };
    const s = installmentSchedule(terms, card.closingDay, today);
    return { firstDue: firstDueDate(billing, card), monthlyMinor: s.monthlyMinor, principalMinor };
  }, [principal, months, purchasedOn, firstDue, card.closingDay, card.dueDay, today]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next: Partial<Record<Field, string>> = {};
    if (!description.trim()) next.description = "What is it for? Like \"Cash loan\" or \"iPhone 16\".";
    if (!categoryId) next.categoryId = "Choose a category.";
    const principalMinor = parseAmountToMinor(principal);
    if (!principalMinor) next.principalMinor = "Enter the amount, like 10,000.";
    const n = Number(months);
    if (!Number.isInteger(n) || n < 1 || n > 60) next.months = "Use 1 to 60 months.";
    if (!DATE.test(purchasedOn)) next.purchasedOn = "Pick the loan date.";
    if (!DATE.test(firstDue)) next.firstDue = "Pick the date the first payment is due.";
    else if (firstDue <= purchasedOn) next.firstDue = "The first payment is due after the loan date.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !principalMinor) return;

    setBusy(true);
    try {
      await api.createInstallment(card.id, {
        description: description.trim(),
        categoryId: Number(categoryId),
        purchasedOn,
        principalMinor,
        months: n,
        firstBillingMonth: billingMonthFor(firstDue, purchasedOn, card),
        loanType: loanTypeFor(card),
      });
      refreshAlerts();
      onSaved(`${description.trim()} added to ${card.name}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        const mapped: Partial<Record<Field, string>> = {};
        for (const [key, message] of Object.entries(err.fields)) mapped[(key === "firstBillingMonth" ? "firstDue" : key) as Field] = message;
        setErrors(mapped);
      } else setFormError(err instanceof Error ? err.message : "Couldn't add the loan. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const overLimit = preview && preview.principalMinor > card.summary.availableMinor;

  return (
    <form className="cat-editor loan-form" onSubmit={onSubmit} noValidate>
      <div className="add-form__grid">
        <TextField label="What's it for" placeholder="Cash loan" maxLength={80} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} data-autofocus />
        <Select label="Category" options={expenseOptions} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.categoryId} />
      </div>
      <div className="add-form__grid">
        <TextField label="Amount" prefix="₱" inputMode="decimal" placeholder="10,000.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} error={errors.principalMinor} />
        <TextField label="Loan date" type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} error={errors.purchasedOn} />
      </div>
      <div className="add-form__grid">
        <TextField label="Months to pay" type="number" min={1} max={60} list="loan-terms" value={months} onChange={(e) => setMonths(e.target.value)} error={errors.months} />
        <datalist id="loan-terms">
          {TERMS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <TextField
          label="First payment"
          type="date"
          value={firstDue}
          onChange={(e) => setFirstDue(e.target.value)}
          error={errors.firstDue}
          hint={`${card.name} payments are due on day ${card.dueDay}.`}
        />
      </div>
      {preview && (
        <p className="loan-form__summary" role="status">
          {loanTypeLabels[loanTypeFor(card)]}: <strong>{formatMoney(preview.monthlyMinor)}</strong> a month for {months} months, first due <strong>{shortDate(preview.firstDue)}</strong>.{" "}
          {overLimit
            ? `That's more than the ${formatMoney(card.summary.availableMinor)} available on ${card.name}.`
            : `${formatMoney(card.summary.availableMinor - preview.principalMinor)} of credit left on ${card.name} after this.`}
          {preview.firstDue !== firstDue && ` The date moved to ${card.name}'s due day.`}
        </p>
      )}
      {formError && (
        <p className="add-form__error" role="alert">
          {formError}
        </p>
      )}
      <div className="salary-form__actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add loan"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
