import logoMark from "@mft/ui/logo-mark.svg";
import type { ReactNode, Ref } from "react";
import { linkClick } from "../lib/router";
import { CloseIcon } from "./icons";

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  id: string;
  main: NavItem[];
  reports: NavItem[];
  /** Pinned to the bottom of the sidebar. */
  bottom: NavItem[];
  currentPath: string;
  open: boolean;
  onNavigate: () => void;
  onClose: () => void;
  closeRef: Ref<HTMLButtonElement>;
}

export function Sidebar({ id, main, reports, bottom, currentPath, open, onNavigate, onClose, closeRef }: SidebarProps) {
  const link = (item: NavItem) => (
    <li key={item.path}>
      <a
        className="sidebar__link"
        href={item.path}
        aria-current={item.path === currentPath ? "page" : undefined}
        onClick={(e) => {
          linkClick(e);
          onNavigate();
        }}
      >
        {item.icon}
        <span>{item.label}</span>
      </a>
    </li>
  );

  return (
    <aside id={id} className={`sidebar${open ? " sidebar--open" : ""}`} aria-label="Sidebar">
      <div className="sidebar__brand">
        <img src={logoMark} alt="" width={32} height={32} />
        <span>MyFinancialTracker</span>
        {/* Only shown in the mobile drawer, so the drawer can always be closed from inside it. */}
        <button ref={closeRef} type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close menu">
          <CloseIcon />
        </button>
      </div>
      <nav className="sidebar__nav" aria-label="Main">
        <ul className="sidebar__list">{main.map(link)}</ul>
        <h2 className="sidebar__group" id={`${id}-reports`}>
          Report
        </h2>
        <ul className="sidebar__list" aria-labelledby={`${id}-reports`}>
          {reports.map(link)}
        </ul>
        <ul className="sidebar__list sidebar__list--bottom">{bottom.map(link)}</ul>
      </nav>
    </aside>
  );
}
