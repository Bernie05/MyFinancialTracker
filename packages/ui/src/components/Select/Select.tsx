import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "../../lib/cx";
import "../TextField/TextField.css";
import "./Select.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "prefix"> {
  /** Always visible, like TextField's. */
  label: string;
  options: readonly SelectOption[];
  /** Helper text under the field. */
  hint?: ReactNode;
  /** Replaces the hint, sets aria-invalid and the error border. Says what to fix. */
  error?: ReactNode;
  /** Decorative content before the value, such as the selected category's color dot. */
  prefix?: ReactNode;
}

/**
 * A labelled native <select> styled to match TextField. Native keeps the platform picker,
 * keyboard behavior and screen-reader support for free.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, prefix, id, className, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? `mft-select-${autoId}`;
  const messageId = `${selectId}-message`;
  const message = error ?? hint;

  return (
    <div className={cx("mft-field", "mft-select", prefix != null && "mft-select--prefixed", error != null && "mft-field--error", disabled && "mft-field--disabled", className)}>
      <label className="mft-field__label" htmlFor={selectId}>
        {label}
      </label>
      <div className="mft-field__control">
        {prefix != null && (
          <span className="mft-select__prefix" aria-hidden="true">
            {prefix}
          </span>
        )}
        <select
          ref={ref}
          id={selectId}
          className="mft-field__input mft-select__input"
          disabled={disabled}
          aria-invalid={error != null || undefined}
          aria-describedby={message != null ? messageId : undefined}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg className="mft-select__chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>
      {message != null && (
        <p className="mft-field__message" id={messageId}>
          {message}
        </p>
      )}
    </div>
  );
});
