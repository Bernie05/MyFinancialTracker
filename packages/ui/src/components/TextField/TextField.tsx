import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./TextField.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  /** Visible label. Required: placeholders are not labels. */
  label: string;
  /** Helper text under the field. Hidden while `error` is shown. */
  hint?: ReactNode;
  /** Error message. Sets aria-invalid and replaces the hint. Say what to fix: "Enter an amount above ₱0". */
  error?: ReactNode;
  /** Fixed text before the value, e.g. "₱" for amount fields. */
  prefix?: ReactNode;
  /** Fixed text after the value, e.g. "/ month". */
  suffix?: ReactNode;
}

/** A labelled single-line input. For money, pass `prefix="₱"` and `inputMode="decimal"`. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, prefix, suffix, id, className, disabled, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `mft-field-${autoId}`;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cx("mft-field", error != null && "mft-field--error", disabled && "mft-field--disabled", className)}>
      <label className="mft-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="mft-field__control">
        {prefix != null && <span className="mft-field__affix" aria-hidden="true">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className="mft-field__input"
          disabled={disabled}
          aria-invalid={error != null || undefined}
          aria-describedby={message != null ? messageId : undefined}
          {...rest}
        />
        {suffix != null && <span className="mft-field__affix" aria-hidden="true">{suffix}</span>}
      </div>
      {message != null && (
        <p className="mft-field__message" id={messageId}>
          {message}
        </p>
      )}
    </div>
  );
});
