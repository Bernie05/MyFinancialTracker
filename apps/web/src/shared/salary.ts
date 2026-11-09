/**
 * Salary math, shared by the server (validation) and the My Salary page. Integer centavos throughout.
 *
 * Gross pay is entered per month or per year; deductions are always per month (that's how a payslip
 * shows them). A year is 12 monthly payslips: the 13th-month pay and bonuses aren't included.
 */
import type { SalaryBasis, SalaryDeduction, SalaryDeductionKind, SalaryProfile } from "./contracts";

export const statutoryKinds = ["tax", "sss", "philhealth", "pagibig"] as const satisfies readonly SalaryDeductionKind[];

export const deductionLabels: Record<SalaryDeductionKind, string> = {
  tax: "Withholding tax",
  sss: "SSS",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG",
  other: "Other",
};

/** Gross pay per month: an annual figure is split over 12 months (rounded to the centavo). */
export function monthlyGross(basis: SalaryBasis, grossMinor: number): number {
  return basis === "monthly" ? grossMinor : Math.round(grossMinor / 12);
}

/** Gross pay per year: exact when entered per year, 12 × the monthly figure otherwise. */
export function annualGross(basis: SalaryBasis, grossMinor: number): number {
  return basis === "annual" ? grossMinor : grossMinor * 12;
}

export interface SalaryBreakdown {
  monthlyGrossMinor: number;
  annualGrossMinor: number;
  /** Per month; each statutory kind is 0 when it isn't listed. */
  byKind: Record<(typeof statutoryKinds)[number], number>;
  /** "Other" deductions, each with its own name. */
  others: SalaryDeduction[];
  monthlyDeductionsMinor: number;
  monthlyNetMinor: number;
  annualNetMinor: number;
}

export function salaryBreakdown(profile: SalaryProfile): SalaryBreakdown {
  const monthlyGrossMinor = monthlyGross(profile.basis, profile.grossMinor);
  const annualGrossMinor = annualGross(profile.basis, profile.grossMinor);
  const byKind = { tax: 0, sss: 0, philhealth: 0, pagibig: 0 };
  for (const d of profile.deductions) if (d.kind !== "other") byKind[d.kind] += d.amountMinor;
  const monthlyDeductionsMinor = profile.deductions.reduce((sum, d) => sum + d.amountMinor, 0);
  const monthlyNetMinor = monthlyGrossMinor - monthlyDeductionsMinor;
  return {
    monthlyGrossMinor,
    annualGrossMinor,
    byKind,
    others: profile.deductions.filter((d) => d.kind === "other"),
    monthlyDeductionsMinor,
    monthlyNetMinor,
    // From the annual gross, so a salary entered per year keeps its exact yearly figure.
    annualNetMinor: annualGrossMinor - monthlyDeductionsMinor * 12,
  };
}

// Estimates (Philippines, employee share) --------------------------------------------------------
// A starting point to pre-fill the form, not payroll: the payslip's figures win. Rates as of 2025.

const PESO = 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** SSS 2025: 5% of the monthly salary credit, which runs ₱5,000–₱35,000 in ₱500 steps. */
export function estimateSss(monthlyGrossMinor: number): number {
  const credit = clamp(Math.floor((monthlyGrossMinor + 250 * PESO) / (500 * PESO)) * 500 * PESO, 5_000 * PESO, 35_000 * PESO);
  return Math.round(credit * 0.05);
}

/** PhilHealth 2025: 5% premium split with the employer (2.5% yours), on pay floored at ₱10,000 and capped at ₱100,000. */
export function estimatePhilhealth(monthlyGrossMinor: number): number {
  return Math.round(clamp(monthlyGrossMinor, 10_000 * PESO, 100_000 * PESO) * 0.025);
}

/** Pag-IBIG: 2% (1% at ₱1,500 or less) of pay up to ₱10,000, so at most ₱200. */
export function estimatePagibig(monthlyGrossMinor: number): number {
  const rate = monthlyGrossMinor <= 1_500 * PESO ? 0.01 : 0.02;
  return Math.round(Math.min(monthlyGrossMinor, 10_000 * PESO) * rate);
}

/** TRAIN law income tax table (2023 onward), on annual taxable income. Returns the annual tax. */
export function annualIncomeTax(annualTaxableMinor: number): number {
  const brackets = [
    { over: 8_000_000, base: 2_202_500, rate: 0.35 },
    { over: 2_000_000, base: 402_500, rate: 0.3 },
    { over: 800_000, base: 102_500, rate: 0.25 },
    { over: 400_000, base: 22_500, rate: 0.2 },
    { over: 250_000, base: 0, rate: 0.15 },
  ];
  const b = brackets.find((x) => annualTaxableMinor > x.over * PESO);
  return b ? Math.round(b.base * PESO + (annualTaxableMinor - b.over * PESO) * b.rate) : 0;
}

/** All four statutory deductions per month. Tax is on pay after SSS, PhilHealth and Pag-IBIG. */
export function estimateStatutory(monthlyGrossMinor: number): Record<(typeof statutoryKinds)[number], number> {
  const sss = estimateSss(monthlyGrossMinor);
  const philhealth = estimatePhilhealth(monthlyGrossMinor);
  const pagibig = estimatePagibig(monthlyGrossMinor);
  const taxable = Math.max(0, monthlyGrossMinor - sss - philhealth - pagibig);
  return { sss, philhealth, pagibig, tax: Math.round(annualIncomeTax(taxable * 12) / 12) };
}
