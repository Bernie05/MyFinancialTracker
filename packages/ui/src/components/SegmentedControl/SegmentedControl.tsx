import { useRef, type KeyboardEvent } from "react";
import { cx } from "../../lib/cx";
import "./SegmentedControl.css";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** 2–4 mutually exclusive choices. More than four: use a select. */
  options: ReadonlyArray<SegmentOption<T>>;
  /** The selected value (controlled). */
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Transaction type". */
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Picks one of a few options in place: Expense / Income, Week / Month / Year.
 * A radio group under the hood: Tab enters once, arrow keys move the selection.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let next: number | undefined;
    if (step !== undefined) next = (index + step + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next === undefined) return;

    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("mft-segmented", `mft-segmented--${size}`, className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={cx("mft-segmented__option", selected && "mft-segmented__option--selected")}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
