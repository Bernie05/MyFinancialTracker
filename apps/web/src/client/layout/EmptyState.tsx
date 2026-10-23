import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  children?: ReactNode;
  /** The next step: a button or link. */
  action?: ReactNode;
  tone?: "neutral" | "error";
}

/** Empty and error states share one shape: an icon well, what happened, and the way forward. */
export function EmptyState({ icon, heading, children, action, tone = "neutral" }: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state--${tone}`} role={tone === "error" ? "alert" : undefined}>
      {icon && <span className="empty-state__icon">{icon}</span>}
      <p className="empty-state__heading">{heading}</p>
      {children && <p className="empty-state__text">{children}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
