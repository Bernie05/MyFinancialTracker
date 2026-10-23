import type { ReactNode } from "react";

/** Every screen opens the same way: title, one line of context, actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page__header">
      <div className="page__titles">
        <h1 className="page__title">{title}</h1>
        {subtitle != null && <p className="page__subtitle">{subtitle}</p>}
      </div>
      {actions != null && <div className="page__actions">{actions}</div>}
    </header>
  );
}
