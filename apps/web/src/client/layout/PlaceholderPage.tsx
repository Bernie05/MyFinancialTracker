import type { ReactNode } from "react";
import { linkClick } from "../lib/router";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";

interface PlaceholderPageProps {
  title: string;
  icon: ReactNode;
  heading: string;
  message: string;
  action?: { href: string; label: string };
}

/** A screen that isn't built yet: says what will be here and points somewhere useful now. */
export function PlaceholderPage({ title, icon, heading, message, action }: PlaceholderPageProps) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <section className="panel panel--empty" aria-label={heading}>
        <EmptyState
          icon={icon}
          heading={heading}
          action={
            action && (
              <a className="link-button" href={action.href} onClick={linkClick}>
                {action.label}
              </a>
            )
          }
        >
          {message}
        </EmptyState>
      </section>
    </div>
  );
}
