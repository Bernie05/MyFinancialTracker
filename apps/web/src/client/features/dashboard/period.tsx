/**
 * The month/year picker and the month + year figure tiles, shared by the Dashboard and the
 * Income and Expenses overviews.
 */
import { Amount, Button, formatMoney, Select, type StatTrend } from "@mft/ui";
import { useState, type ReactNode } from "react";
import type { Month } from "../../../shared/contracts";
import { currentMonth, monthLabel, shiftMonth } from "../../lib/dates";
import { ArrowTrend } from "./ArrowTrend";

/** A figure-shaped placeholder, so a tile never shows ₱0.00 before the real number arrives. */
export const loadingFigure = <span className="skeleton__inline" aria-label="Loading" />;
export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("en-PH", { month: "long" }));
export const pad = (n: number) => String(n).padStart(2, "0");

/** The picked month and year: today's by default; months after today aren't offered. */
export function usePeriod() {
  const today = currentMonth();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYearState] = useState(thisYear);
  const [monthNo, setMonthNo] = useState(Number(today.slice(5)));
  const month: Month = `${year}-${pad(monthNo)}`;

  function setYear(next: number) {
    setYearState(next);
    if (next === thisYear) setMonthNo((m) => Math.min(m, Number(today.slice(5))));
  }

  return {
    today,
    thisYear,
    year,
    monthNo,
    month,
    prevMonth: shiftMonth(month, -1),
    monthName: MONTH_NAMES[monthNo - 1]!,
    /** "2026 so far" for this year, "2025 total" for a past one. */
    yearLabel: year === thisYear ? `${year} so far` : `${year} total`,
    setYear,
    setMonthNo,
    reset: () => {
      setYearState(thisYear);
      setMonthNo(Number(today.slice(5)));
    },
  };
}
export type Period = ReturnType<typeof usePeriod>;

export function PeriodPicker({ period }: { period: Period }) {
  const { today, thisYear, year, monthNo, month, setYear, setMonthNo, reset } = period;
  const monthOptions = MONTH_NAMES.slice(0, year === thisYear ? Number(today.slice(5)) : 12).map((name, i) => ({ value: String(i + 1), label: name }));
  const yearOptions = Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => ({ value: String(y), label: String(y) }));
  return (
    <div className="dash-period">
      <Select label="Month" value={String(monthNo)} options={monthOptions} onChange={(e) => setMonthNo(Number(e.target.value))} />
      <Select label="Year" value={String(year)} options={yearOptions} onChange={(e) => setYear(Number(e.target.value))} />
      {month !== today && (
        <Button variant="ghost" size="sm" onClick={reset}>
          This month
        </Button>
      )}
    </div>
  );
}

/** "₱2,300.00 more than September": the change in plain words, with an arrow for direction. */
export function trend(current: number, previous: number | undefined, prevMonth: string, upIsGood: boolean): StatTrend | undefined {
  if (previous === undefined || previous === 0) return undefined;
  const diff = current - previous;
  const month = monthLabel(prevMonth).split(" ")[0];
  if (diff === 0) return { direction: "flat", sentiment: "neutral", text: `Same as ${month}` };
  const up = diff > 0;
  return {
    direction: up ? "up" : "down",
    sentiment: up === upIsGood ? "positive" : "negative",
    text: `${formatMoney(Math.abs(diff))} ${up ? "more" : "less"} than ${month}`,
  };
}

/** A money figure for a tile, or the loading placeholder. */
export const money = (minor: number | undefined, size: "lg" | "sm" = "lg") =>
  minor === undefined ? loadingFigure : <Amount minorUnits={minor} size={size} tone="neutral" />;

/**
 * One headline figure for the month, with the year's figure underneath. `accent` is the one bold tile
 * per page; `good`/`bad` color the figure (savings rate); `meter` draws a 0–100% bar under it.
 */
export function PeriodTile({ label, month, year, yearLabel, trend: t, note, meter, tone, action }: {
  label: string;
  month: ReactNode;
  year: ReactNode;
  yearLabel: string;
  trend?: StatTrend;
  note?: ReactNode;
  meter?: number | null;
  tone?: "good" | "bad" | "neutral" | "accent";
  /** A link to the page behind the figure ("Open My Salary"). */
  action?: ReactNode;
}) {
  return (
    <div className={`mft-stat mft-stat--lg period-tile${tone ? ` period-tile--${tone}` : ""}`}>
      <p className="mft-stat__label">{label}</p>
      <div className="period-tile__value">{month}</div>
      {t && <ArrowTrend trend={t} />}
      {note && <p className="period-tile__note">{note}</p>}
      {meter != null && (
        <div className="period-tile__meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </div>
      )}
      <span className="period-tile__spacer" />
      <p className="period-tile__year">
        <span>{yearLabel}</span> {year}
      </p>
      {action}
    </div>
  );
}
