import { Card } from "@mft/ui";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "../../layout/icons";
import { linkClick } from "../../lib/router";

export interface SectionLink {
  href: string;
  icon: ReactNode;
  label: string;
  /** One line under the label: what's there ("₱41,731.67 take-home a month"). */
  detail: ReactNode;
  /** A headline figure on the right. */
  figure?: ReactNode;
}

/** The pages inside a section (Income → My Salary, Other Income), each with its key figure. */
export function SectionLinks({ title, subtitle, links }: { title: string; subtitle?: string; links: SectionLink[] }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <ul className="section-links">
        {links.map((l) => (
          <li key={l.href}>
            <a className="section-links__row" href={l.href} onClick={linkClick}>
              <span className="section-links__icon">{l.icon}</span>
              <span className="section-links__main">
                <span className="section-links__label">{l.label}</span>
                <span className="section-links__detail">{l.detail}</span>
              </span>
              {l.figure && <span className="section-links__figure">{l.figure}</span>}
              <span className="section-links__chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
