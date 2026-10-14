import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. One `primary` per view; `danger` only for destructive actions. Default "primary". */
  variant?: ButtonVariant;
  /** "md" (40px) by default; "sm" (32px) inside rows and toolbars. */
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, and blocks clicks. */
  loading?: boolean;
  /** An icon element placed before the label. */
  iconStart?: ReactNode;
  /** Stretch to the container's width (mobile forms). */
  fullWidth?: boolean;
}

/** Triggers an action. The label says exactly what happens: "Add expense", not "Submit". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconStart,
    fullWidth = false,
    disabled,
    type = "button",
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "mft-button",
        `mft-button--${variant}`,
        `mft-button--${size}`,
        fullWidth && "mft-button--full",
        loading && "mft-button--loading",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="mft-button__spinner" aria-hidden="true" />}
      {iconStart && <span className="mft-button__icon" aria-hidden="true">{iconStart}</span>}
      <span className="mft-button__label">{children}</span>
    </button>
  );
});
