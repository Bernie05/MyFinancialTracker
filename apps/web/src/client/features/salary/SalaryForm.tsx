import { Button, Card, formatMoney, SegmentedControl, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import type { SalaryBasis, SalaryDeduction, SalaryProfile } from "../../../shared/contracts";
import { annualGross, deductionLabels, estimateStatutory, monthlyGross, statutoryKinds } from "../../../shared/salary";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { PlusIcon, TrashIcon } from "../../layout/icons";
import { parseAmountToMinor } from "../../lib/parseAmount";

type Statutory = (typeof statutoryKinds)[number];
const BASES = [
  { value: "monthly", label: "Per month" },
  { value: "annual", label: "Per year" },
] as const;

/** Centavos → "1234.50" for an input (string maths, so no float rounding). */
const toInput = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
/** Empty counts as ₱0 for a deduction; null means it isn't a valid amount. */
const parseDeduction = (text: string) => (text.trim() === "" ? 0 : parseAmountToMinor(text));

interface OtherRow {
  id: number;
  name: string;
  amount: string;
}

/** Set up or change your salary: gross pay per month or per year, and each payslip deduction per month. */
export function SalaryForm({ initial, onSaved, onCancel }: { initial: SalaryProfile | null; onSaved: () => void; onCancel?: () => void }) {
  const [basis, setBasis] = useState<SalaryBasis>(initial?.basis ?? "monthly");
  const [gross, setGross] = useState(initial ? toInput(initial.grossMinor) : "");
  const [statutory, setStatutory] = useState<Record<Statutory, string>>(() => {
    const amount = (kind: Statutory) => initial?.deductions.find((d) => d.kind === kind)?.amountMinor;
    return Object.fromEntries(statutoryKinds.map((k) => [k, amount(k) === undefined ? "" : toInput(amount(k)!)])) as Record<Statutory, string>;
  });
  const [others, setOthers] = useState<OtherRow[]>(
    () => initial?.deductions.filter((d) => d.kind === "other").map((d, i) => ({ id: i, name: d.name, amount: toInput(d.amountMinor) })) ?? [],
  );
  const [nextId, setNextId] = useState(1000);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const grossMinor = parseAmountToMinor(gross);
  const perMonth = grossMinor ? monthlyGross(basis, grossMinor) : null;
  const deductionsMinor = [...statutoryKinds.map((k) => parseDeduction(statutory[k])), ...others.map((o) => parseDeduction(o.amount))];
  const totalDeducted = deductionsMinor.every((d) => d !== null) ? deductionsMinor.reduce<number>((s, d) => s + d!, 0) : null;

  function estimate() {
    if (!perMonth) {
      setErrors({ gross: "Enter your gross pay first." });
      return;
    }
    const e = estimateStatutory(perMonth);
    setStatutory({ tax: toInput(e.tax), sss: toInput(e.sss), philhealth: toInput(e.philhealth), pagibig: toInput(e.pagibig) });
    setErrors({});
    setNotice("Filled in from 2025 rates for an employee. Check each one against your payslip and change any that differ.");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const local: Record<string, string> = {};
    if (!grossMinor) local.gross = "Enter your gross pay, like 45,000.";
    const deductions: SalaryDeduction[] = [];
    for (const kind of statutoryKinds) {
      const amount = parseDeduction(statutory[kind]);
      if (amount === null) local[kind] = "Enter an amount like 1,250.50, or leave it empty for ₱0.";
      else deductions.push({ kind, name: deductionLabels[kind], amountMinor: amount });
    }
    for (const o of others) {
      const amount = parseDeduction(o.amount);
      if (!o.name.trim() && (amount ?? 0) === 0) continue; // an untouched blank row
      if (!o.name.trim()) local[`name-${o.id}`] = "Name this deduction, like Loan or HMO.";
      if (amount === null) local[`amount-${o.id}`] = "Enter an amount like 500.";
      else deductions.push({ kind: "other", name: o.name.trim(), amountMinor: amount });
    }
    if (grossMinor && totalDeducted !== null && totalDeducted > monthlyGross(basis, grossMinor)) {
      local.deductions = "Deductions add up to more than your gross pay per month.";
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setBusy(true);
    try {
      await api.saveSalary({ basis, grossMinor: grossMinor!, deductions });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setErrors(err.fields.grossMinor ? { ...err.fields, gross: err.fields.grossMinor } : err.fields);
        setFormError(err.fields.deductions ?? err.message);
      } else setFormError(err instanceof Error ? err.message : "Couldn't save your salary. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={initial ? "Edit your salary" : "Your salary"} subtitle="Use the figures on your payslip. Deductions are per month.">
      <form className="add-form salary-form" onSubmit={onSubmit} noValidate>
        <fieldset className="salary-form__group">
          <legend>Gross pay</legend>
          <SegmentedControl aria-label="Enter gross pay" options={BASES} value={basis} onChange={setBasis} />
          <TextField
            label={basis === "monthly" ? "Gross pay per month" : "Gross pay per year"}
            prefix="₱"
            suffix={basis === "monthly" ? "/ month" : "/ year"}
            inputMode="decimal"
            autoComplete="off"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            error={errors.gross}
            hint={
              grossMinor
                ? basis === "monthly"
                  ? `${formatMoney(annualGross(basis, grossMinor))} a year`
                  : `${formatMoney(monthlyGross(basis, grossMinor))} a month`
                : "Before any deductions."
            }
          />
        </fieldset>

        <fieldset className="salary-form__group">
          <legend>Government deductions and tax</legend>
          <div className="salary-form__estimate">
            <Button type="button" variant="secondary" size="sm" onClick={estimate}>
              Estimate from 2025 PH rates
            </Button>
            <span className="salary-form__hint">Fills in SSS, PhilHealth, Pag-IBIG and withholding tax from your gross pay.</span>
          </div>
          {notice && (
            <p className="salary-form__notice" role="status">
              {notice}
            </p>
          )}
          <div className="add-form__grid">
            {statutoryKinds.map((kind) => (
              <TextField
                key={kind}
                label={deductionLabels[kind]}
                prefix="₱"
                suffix="/ month"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={statutory[kind]}
                onChange={(e) => setStatutory((s) => ({ ...s, [kind]: e.target.value }))}
                error={errors[kind]}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="salary-form__group">
          <legend>Other deductions</legend>
          <p className="salary-form__hint">Loans (SSS, Pag-IBIG, company), HMO, union dues, savings plans: anything else on the payslip.</p>
          {others.map((o) => (
            <div key={o.id} className="salary-form__other">
              <TextField
                label="Name"
                value={o.name}
                maxLength={60}
                onChange={(e) => setOthers((rows) => rows.map((r) => (r.id === o.id ? { ...r, name: e.target.value } : r)))}
                error={errors[`name-${o.id}`]}
              />
              <TextField
                label="Amount"
                prefix="₱"
                suffix="/ month"
                inputMode="decimal"
                autoComplete="off"
                value={o.amount}
                onChange={(e) => setOthers((rows) => rows.map((r) => (r.id === o.id ? { ...r, amount: e.target.value } : r)))}
                error={errors[`amount-${o.id}`]}
              />
              <button
                type="button"
                className="icon-button salary-form__remove"
                aria-label={`Remove ${o.name || "this deduction"}`}
                onClick={() => setOthers((rows) => rows.filter((r) => r.id !== o.id))}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconStart={<PlusIcon />}
              onClick={() => {
                setOthers((rows) => [...rows, { id: nextId, name: "", amount: "" }]);
                setNextId((n) => n + 1);
              }}
            >
              Add a deduction
            </Button>
          </div>
        </fieldset>

        {perMonth !== null && totalDeducted !== null && (
          <p className="salary-form__total">
            Take-home: <strong>{formatMoney(perMonth - totalDeducted)}</strong> a month, after {formatMoney(totalDeducted)} in deductions.
          </p>
        )}
        {(formError || errors.deductions) && (
          <p className="add-form__error" role="alert">
            {formError ?? errors.deductions}
          </p>
        )}
        <div className="salary-form__actions">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save salary"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
