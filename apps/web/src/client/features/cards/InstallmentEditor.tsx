import { Button, formatMoney, Select, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import {
  categoryColorPresets,
  colorOwner,
  newCategorySchema,
  newInstallmentSchema,
  type CardSummary,
  type Category,
  type Installment,
  type SplitInput,
  type NewCategory,
} from "../../../shared/contracts";
import { defaultFirstBillingMonth, installmentSchedule } from "../../../shared/installments";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { ColorDot } from "../../layout/ColorDot";
import { categoryColor } from "../../lib/categoryColor";
import { categoryTree } from "../../lib/categoryOptions";
import { monthLabel, todayLocal } from "../../lib/dates";
import { parseAmountToMinor } from "../../lib/parseAmount";
import { SplitField, splitProblem, usePeople } from "../people/SplitField";
import { normalizeSplit } from "../../../shared/split";

type Field = "description" | "categoryId" | "subcategoryId" | "newParent" | "newChild" | "purchasedOn" | "principalMinor" | "months" | "addOnRateBps" | "amortizationMinor" | "feeMinor" | "firstBillingMonth" | "split";
type FieldErrors = Partial<Record<Field, string>>;

const TERMS = ["3", "6", "9", "12", "18", "24", "36"];
const NEW = "new";

/** Creating a category failed: the message goes under that name field. */
class CategoryError extends Error {
  constructor(readonly field: "newParent" | "newChild", message: string) {
    super(message);
  }
}
const pesos =(minor: number | null | undefined) => (minor ? (minor / 100).toFixed(2) : "");

interface InstallmentEditorProps {
  card: CardSummary;
  plan: Installment | null;
  categories: Category[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}

/** Add or edit a plan, with a live preview of the monthly amount, interest and end month. */
export function InstallmentEditor({ card, plan, categories: loaded, onSaved, onCancel }: InstallmentEditorProps) {
  // Categories created from this form, until the page reloads its list.
  const [added, setAdded] = useState<Category[]>([]);
  const categories = [...loaded, ...added.filter((a) => !loaded.some((c) => c.id === a.id))];
  const tree = categoryTree(categories, "expense");
  const planCategory = plan ? categories.find((c) => c.id === plan.category.id) : undefined;
  const [description, setDescription] = useState(plan?.description ?? "");
  // Two pickers: a parent category, then an optional subcategory. Either can be "+ New…" with a name field.
  const [parentId, setParentId] = useState(planCategory ? String(planCategory.parentId ?? planCategory.id) : "");
  const [childId, setChildId] = useState(planCategory?.parentId ? String(planCategory.id) : "");
  const [newParent, setNewParent] = useState("");
  const [newChild, setNewChild] = useState("");
  const [purchasedOn, setPurchasedOn] = useState(plan?.purchasedOn ?? todayLocal());
  const [principal, setPrincipal] = useState(pesos(plan?.principalMinor));
  // The card's own terms (with their rates) plus the common ones, in order.
  const cardRates = card.installmentRates;
  const rateFor = (months: number) => cardRates.find((r) => r.months === months);
  const terms = [...new Set([...TERMS, ...cardRates.map((r) => String(r.months))])].sort((a, b) => Number(a) - Number(b));
  // A new plan starts on 12 months, or the card's first term if it doesn't offer 12, with that term's rate.
  const startTerm = plan ? String(plan.months) : rateFor(12) || cardRates.length === 0 ? "12" : String(cardRates[0]!.months);
  const [term, setTerm] = useState(terms.includes(startTerm) ? startTerm : "custom");
  const [customMonths, setCustomMonths] = useState(plan && !terms.includes(startTerm) ? startTerm : "");
  const [rate, setRate] = useState(plan ? String(plan.addOnRateBps / 100) : String((rateFor(Number(startTerm))?.addOnRateBps ?? 0) / 100));

  /** Picking a term the card has a rate for fills that rate in (it stays editable). */
  function chooseMonths(value: string, custom: boolean) {
    if (custom) setCustomMonths(value);
    else setTerm(value);
    const configured = rateFor(Number(custom ? value : value === "custom" ? customMonths : value));
    if (configured) setRate(String(configured.addOnRateBps / 100));
  }
  const [override, setOverride] = useState(pesos(plan?.amortizationMinor));
  const [fee, setFee] = useState(pesos(plan?.feeMinor));
  /** Editing a loan (Add loan): the form shows only the loan's own fields. */
  // Everything on an online credit account is a loan, even a plan imported without a loan type.
  const isLoan = plan?.loanType != null || card.kind === "online";
  // Empty = "next statement after the purchase", worked out from the purchase date.
  const [firstMonth, setFirstMonth] = useState(plan?.firstBillingMonth ?? "");
  // Who the plan is for: a new plan starts with the card's usual person.
  const [split, setSplit] = useState<SplitInput | null>(() =>
    plan ? plan.split : card.defaultPersonId ? { mode: "equal", parts: [{ personId: card.defaultPersonId, value: 1 }] } : null,
  );
  const { people, reload: reloadPeople } = usePeople();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const months = Number(term === "custom" ? customMonths : term);
  const configuredRate = Number.isInteger(months) ? rateFor(months) : undefined;
  const rateHint = !configuredRate
    ? "0 for a 0% plan"
    : Math.round(Number(rate) * 100) === configuredRate.addOnRateBps
      ? `${card.name}'s rate for ${months} months`
      : `${card.name}'s rate for ${months} months is ${configuredRate.addOnRateBps / 100}%`;
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

  const allParents = categories.filter((c) => c.parentId === null);
  const selectedParent = tree.find((t) => String(t.parent.id) === parentId);
  const children = selectedParent?.children ?? [];
  const selectedChild = children.find((c) => String(c.id) === childId);
  const categoryId = selectedChild?.id ?? selectedParent?.parent.id;
  const nameTaken = (name: string, among: Category[]) => among.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

  function pickParent(value: string) {
    setParentId(value);
    setChildId("");
    setNewChild("");
  }

  /** A top-level category needs a color unique among top-level ones: the first free preset, else a random one. */
  function freeColor() {
    const preset = categoryColorPresets.find((key) => !colorOwner(allParents, key));
    if (preset) return preset;
    for (;;) {
      const hex = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
      if (!colorOwner(allParents, hex)) return hex;
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next: FieldErrors = {};
    const parentIsNew = parentId === NEW;
    const childIsNew = parentIsNew ? newChild.trim() !== "" : childId === NEW;
    if (!parentId) next.categoryId = "Choose a category.";
    if (parentIsNew) {
      const parentName = newCategorySchema.safeParse({ name: newParent, type: "expense", color: "grey", parentId: null });
      if (!parentName.success) next.newParent = parentName.error.issues[0]?.message;
      else if (nameTaken(newParent, allParents)) next.newParent = "A category with this name already exists.";
    }
    if (childIsNew) {
      const childName = newCategorySchema.safeParse({ name: newChild, type: "expense", parentId: 1 });
      if (!childName.success) next.newChild = childName.error.issues[0]?.message;
      else if (nameTaken(newChild, children)) next.newChild = `${selectedParent?.parent.name} already has this subcategory.`;
    }
    const input = {
      description,
      // A category that's about to be created gets its real id after validation passes.
      categoryId: parentIsNew || childIsNew ? 1 : (categoryId ?? 0),
      purchasedOn,
      principalMinor: principalMinor ?? Number.NaN,
      months,
      addOnRateBps: rateBps,
      amortizationMinor: override.trim() ? (overrideMinor ?? Number.NaN) : null,
      feeMinor: fee.trim() ? (feeMinor ?? Number.NaN) : 0,
      firstBillingMonth: billingMonth || undefined,
      split: normalizeSplit(split),
    };
    const parsed = newInstallmentSchema.safeParse(input);
    if (principalMinor === null) next.principalMinor = "Enter an amount like 83,990.00.";
    const problem = splitProblem(split, principalMinor);
    if (problem) next.split = problem;
    if (!Number.isFinite(rateBps)) next.addOnRateBps = "Enter a rate like 0.79, or 0.";
    for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as Field] ??= issue.message;
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // Create the new parent, then the new subcategory under it. Once created, the pickers point at
      // them, so a retry after a later failure doesn't create them twice.
      let finalId = categoryId ?? 0;
      let parentForChild = selectedParent?.parent.id;
      if (parentIsNew) {
        const created = await createCategory({ name: newParent.trim(), type: "expense", color: freeColor(), parentId: null }, "newParent");
        finalId = parentForChild = created.id;
        setAdded((list) => [...list, created]);
        setParentId(String(created.id));
      }
      if (childIsNew && parentForChild) {
        const created = await createCategory({ name: newChild.trim(), type: "expense", parentId: parentForChild }, "newChild");
        finalId = created.id;
        setAdded((list) => [...list, created]);
        setChildId(String(created.id));
        setNewChild("");
      }
      const data = { ...parsed.data, categoryId: finalId };
      // Keep a pre-termination when editing other terms; it's changed from the Pre-terminate action.
      if (plan) await api.updateInstallment(plan.id, { ...data, firstBillingMonth: billingMonth, preterminatedOn: plan.preterminatedOn });
      else await api.createInstallment(card.id, data);
      onSaved(plan ? `${parsed.data.description} saved` : `${parsed.data.description} added`);
    } catch (err) {
      if (err instanceof CategoryError) setErrors({ [err.field]: err.message });
      else if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.startsWith("split") ? "split" : k, v])) as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  /** Create a category; a failure is shown under the matching name field. */
  async function createCategory(input: NewCategory, field: "newParent" | "newChild") {
    try {
      return await api.createCategory(input);
    } catch (err) {
      const message = err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : "Couldn't create the category.";
      throw new CategoryError(field, String(message));
    }
  }

  const parentOptions = [
    { value: "", label: "Choose a category" },
    ...tree.map(({ parent }) => ({ value: String(parent.id), label: parent.name })),
    { value: NEW, label: "+ New category…" },
  ];
  const childOptions = [
    { value: "", label: children.length ? "None (use the category)" : "None" },
    ...children.map((c) => ({ value: String(c.id), label: c.name })),
    { value: NEW, label: "+ New subcategory…" },
  ];

  return (
    <form className="cat-editor" onSubmit={onSubmit} noValidate>
      <TextField label={isLoan ? "What's it for" : "What did you buy?"} placeholder={isLoan ? "Cash loan" : "iPhone 16 Pro (Power Mac)"} maxLength={80} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} data-autofocus />
      <div className="add-form__grid">
        <Select
          label="Category"
          value={parentId}
          onChange={(e) => pickParent(e.target.value)}
          error={errors.categoryId}
          prefix={selectedParent && <ColorDot color={categoryColor(selectedParent.parent.color)} />}
          options={parentOptions}
        />
        {parentId === NEW ? (
          <TextField
            label="Subcategory"
            placeholder="Optional, e.g. Phones"
            maxLength={40}
            value={newChild}
            onChange={(e) => setNewChild(e.target.value)}
            error={errors.newChild}
          />
        ) : (
          <Select
            label="Subcategory"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            error={errors.subcategoryId}
            disabled={!selectedParent}
            options={childOptions}
          />
        )}
      </div>
      {parentId === NEW && (
        <TextField
          label="New category name"
          placeholder="Gadgets"
          maxLength={40}
          value={newParent}
          onChange={(e) => setNewParent(e.target.value)}
          error={errors.newParent}
          hint="Gets a free color; change it on the Categories page"
        />
      )}
      {childId === NEW && parentId !== NEW && (
        <TextField
          label={`New subcategory in ${selectedParent?.parent.name ?? "this category"}`}
          placeholder="Phones"
          maxLength={40}
          value={newChild}
          onChange={(e) => setNewChild(e.target.value)}
          error={errors.newChild}
        />
      )}
      <TextField label={isLoan ? "Loan date" : "Purchase date"} type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} error={errors.purchasedOn} />
      <div className="add-form__grid">
        <TextField label={isLoan ? "Amount" : "Price (principal)"} prefix="₱" inputMode="decimal" placeholder="83,990.00" value={principal} onChange={(e) => setPrincipal(e.target.value)} error={errors.principalMinor} />
        <Select
          label="Term"
          value={term}
          onChange={(e) => chooseMonths(e.target.value, false)}
          options={[
            ...terms.map((t) => {
              const configured = rateFor(Number(t));
              return { value: t, label: configured ? `${t} months · ${configured.addOnRateBps / 100}%` : `${t} months` };
            }),
            { value: "custom", label: "Custom" },
          ]}
        />
      </div>
      {term === "custom" && (
        <TextField label="Months" type="number" min={1} max={60} value={customMonths} onChange={(e) => chooseMonths(e.target.value, true)} error={errors.months} />
      )}
      {/* A loan is the amount over the months: no add-on rate, bank figure or fee to edit (stored values are kept). */}
      {!isLoan && (
      <div className="add-form__grid">
        <TextField
          label="Add-on rate"
          suffix="% a month"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={errors.addOnRateBps}
          hint={rateHint}
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
      )}
      <div className="add-form__grid">
        {!isLoan && <TextField label="Processing fee" prefix="₱" inputMode="decimal" placeholder="Optional" value={fee} onChange={(e) => setFee(e.target.value)} error={errors.feeMinor} hint="Billed once, with month 1" />}
        <TextField
          label="First billed on"
          type="month"
          value={billingMonth}
          onChange={(e) => setFirstMonth(e.target.value)}
          error={errors.firstBillingMonth}
          hint="Defaults to the next statement"
        />
      </div>

      <SplitField value={split} onChange={setSplit} amountMinor={principalMinor} people={people} onPersonAdded={reloadPeople} error={errors.split} />

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
          {plan ? (isLoan ? "Save loan" : "Save installment") : "Add installment"}
        </Button>
      </div>
    </form>
  );
}
