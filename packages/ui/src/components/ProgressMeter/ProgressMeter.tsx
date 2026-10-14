import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./ProgressMeter.css";

export type ProgressMeterKind = "budget" | "goal";

export interface ProgressMeterProps extends HTMLAttributes<HTMLDivElement> {
  /** "budget": spending against a limit (warns near it, flags overspend). "goal": saving toward a target. */
  kind: ProgressMeterKind;
  /** What is measured: "Groceries", "Emergency fund". */
  label: string;
  /** Amount so far, in any unit — minor units are fine; only the ratio is drawn. */
  value: number;
  /** The budget limit or goal target, same unit as `value`. Must be > 0. */
  max: number;
  /** The readout beside the label, already formatted: "₱8,200 of ₱10,000". */
  valueText: ReactNode;
  /**
   * Status line under the bar ("₱1,800 left"). When omitted, the component writes
   * "Over budget" or "Goal reached" for those states, so they never rest on color alone.
   */
  status?: ReactNode;
  /** Budget only: ratio at which the bar turns to the warning state. Default 0.85. */
  warnAt?: number;
}

/** Shows how far along a budget or savings goal is. */
export function ProgressMeter({
  kind,
  label,
  value,
  max,
  valueText,
  status,
  warnAt = 0.85,
  className,
  ...rest
}: ProgressMeterProps) {
  const ratio = max > 0 ? value / max : 0;
  const fill = Math.min(Math.max(ratio, 0), 1);
  const state =
    kind === "goal"
      ? ratio >= 1
        ? "complete"
        : "progress"
      : ratio > 1
        ? "over"
        : ratio >= warnAt
          ? "warn"
          : "ok";

  const statusText = status ?? (state === "over" ? "Over budget" : state === "complete" ? "Goal reached" : null);
  const pct = Math.round(ratio * 100);

  return (
    <div className={cx("mft-meter", `mft-meter--${kind}`, `mft-meter--${state}`, className)} {...rest}>
      <div className="mft-meter__head">
        <span className="mft-meter__label">{label}</span>
        <span className="mft-meter__value">{valueText}</span>
      </div>
      <div
        className="mft-meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuetext={`${pct}%`}
      >
        <div className="mft-meter__fill" style={{ width: `${fill * 100}%` }} />
      </div>
      {statusText != null && <p className="mft-meter__status">{statusText}</p>}
    </div>
  );
}
