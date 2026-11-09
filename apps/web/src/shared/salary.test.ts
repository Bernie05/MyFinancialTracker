import { expect, test } from "bun:test";
import { annualIncomeTax, estimatePagibig, estimatePhilhealth, estimateSss, estimateStatutory, monthlyGross, salaryBreakdown } from "./salary";

const peso = (n: number) => Math.round(n * 100);

test("gross pay converts between per month and per year", () => {
  expect(monthlyGross("monthly", peso(50_000))).toBe(peso(50_000));
  expect(monthlyGross("annual", peso(600_000))).toBe(peso(50_000));
  // An annual figure that doesn't split evenly rounds to the centavo, but the year stays exact.
  const b = salaryBreakdown({ basis: "annual", grossMinor: 100_000_01, deductions: [] });
  expect(b.monthlyGrossMinor).toBe(8_333_33);
  expect(b.annualGrossMinor).toBe(100_000_01);
  expect(b.annualNetMinor).toBe(100_000_01);
});

test("the breakdown totals deductions per kind and keeps the others by name", () => {
  const b = salaryBreakdown({
    basis: "monthly",
    grossMinor: peso(40_000),
    deductions: [
      { kind: "tax", name: "Withholding tax", amountMinor: peso(2_000) },
      { kind: "sss", name: "SSS", amountMinor: peso(1_000) },
      { kind: "other", name: "HMO", amountMinor: peso(500) },
    ],
  });
  expect(b.byKind).toEqual({ tax: peso(2_000), sss: peso(1_000), philhealth: 0, pagibig: 0 });
  expect(b.others.map((d) => d.name)).toEqual(["HMO"]);
  expect(b.monthlyDeductionsMinor).toBe(peso(3_500));
  expect(b.monthlyNetMinor).toBe(peso(36_500));
  expect(b.annualNetMinor).toBe(peso(36_500 * 12));
});

test("SSS: 5% of the salary credit, ₱5,000 to ₱35,000 in ₱500 steps", () => {
  expect(estimateSss(peso(3_000))).toBe(peso(250)); // below the floor
  expect(estimateSss(peso(5_249.99))).toBe(peso(250)); // credit 5,000
  expect(estimateSss(peso(5_250))).toBe(peso(275)); // credit 5,500
  expect(estimateSss(peso(20_000))).toBe(peso(1_000));
  expect(estimateSss(peso(80_000))).toBe(peso(1_750)); // capped at 35,000
});

test("PhilHealth: 2.5% of pay between ₱10,000 and ₱100,000", () => {
  expect(estimatePhilhealth(peso(8_000))).toBe(peso(250));
  expect(estimatePhilhealth(peso(40_000))).toBe(peso(1_000));
  expect(estimatePhilhealth(peso(150_000))).toBe(peso(2_500));
});

test("Pag-IBIG: 1% up to ₱1,500, else 2%, on at most ₱10,000", () => {
  expect(estimatePagibig(peso(1_500))).toBe(peso(15));
  expect(estimatePagibig(peso(5_000))).toBe(peso(100));
  expect(estimatePagibig(peso(50_000))).toBe(peso(200));
});

test("TRAIN income tax brackets", () => {
  expect(annualIncomeTax(peso(250_000))).toBe(0);
  expect(annualIncomeTax(peso(400_000))).toBe(peso(22_500));
  expect(annualIncomeTax(peso(800_000))).toBe(peso(102_500));
  expect(annualIncomeTax(peso(1_000_000))).toBe(peso(152_500));
  expect(annualIncomeTax(peso(9_000_000))).toBe(peso(2_552_500));
});

test("tax is on pay after the contributions", () => {
  // ₱50,000: SSS 1,750, PhilHealth 1,250, Pag-IBIG 200 → taxable 46,800 × 12 = 561,600.
  // 22,500 + 20% × 161,600 = 54,820 a year → 4,568.33 a month.
  expect(estimateStatutory(peso(50_000))).toEqual({ sss: peso(1_750), philhealth: peso(1_250), pagibig: peso(200), tax: peso(4_568.33) });
  // Minimum-wage-level pay owes no tax.
  expect(estimateStatutory(peso(15_000)).tax).toBe(0);
});
