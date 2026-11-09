import type { ReactNode } from "react";
import { linkClick } from "../lib/router";

/**
 * Every screen opens the same way: title, one line of context, actions on the right. A detail page
 * (an account, a card, a person) passes `back` for a link to the list it came from.
 */
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="page__header">
      <div className="page__titles">
        {back && (
          <a className="page__back" href={back.href} onClick={linkClick}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            {back.label}
          </a>
        )}
        <h1 className="page__title">{title}</h1>
        {subtitle != null && <p className="page__subtitle">{subtitle}</p>}
      </div>
      {actions != null && <div className="page__actions">{actions}</div>}
    </header>
  );
}
