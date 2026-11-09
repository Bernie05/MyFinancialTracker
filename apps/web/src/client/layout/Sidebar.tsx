import logoMark from "@mft/ui/logo-mark.svg";
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { linkClick } from "../lib/router";
import type { User } from "../../shared/contracts";
import { APP_VERSION } from "../../shared/version";
import { ChevronDownIcon, CloseIcon, LogoutIcon } from "./icons";

const EXPANDED_KEY = "mft:nav-expanded";

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

/**
 * A run of links. `parent` is a section with its own page (Income, Expenses): a link, with `items`
 * nested under it. `label` is a plain heading (Report). Neither: the top links.
 */
export interface NavGroup {
  parent?: NavItem;
  label?: string;
  items: NavItem[];
}

interface SidebarProps {
  id: string;
  groups: NavGroup[];
  /** Pinned to the bottom of the sidebar. */
  bottom: NavItem[];
  currentPath: string;
  open: boolean;
  onNavigate: () => void;
  onClose: () => void;
  closeRef: Ref<HTMLButtonElement>;
  user: User;
  onSignOut: () => void;
}

export function Sidebar({ id, groups, bottom, currentPath, open, onNavigate, onClose, closeRef, user, onSignOut }: SidebarProps) {
  const anchor = (item: NavItem, className = "sidebar__link") => (
    <a
      className={className}
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
  );
  const link = (item: NavItem) => <li key={item.path}>{anchor(item)}</li>;

  // Accordion sections (Income, Expenses): which are expanded. Remembered between visits; the section
  // you're in always opens, so the page you're on is never hidden.
  const sectionOf = (path: string) =>
    groups.find((g) => g.parent && (path === g.parent.path || g.items.some((c) => path === c.path || path.startsWith(`${c.path}/`))))?.parent?.path;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    let saved: Record<string, boolean> = {};
    try {
      saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      // private window or blocked storage: start collapsed
    }
    const here = sectionOf(currentPath);
    return here ? { ...saved, [here]: true } : saved;
  });
  const save = (next: Record<string, boolean>) => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(next));
    } catch {
      // not remembered this time; harmless
    }
    return next;
  };
  useEffect(() => {
    const here = sectionOf(currentPath);
    if (here) setExpanded((prev) => (prev[here] ? prev : save({ ...prev, [here]: true })));
  }, [currentPath]);
  const isExpanded = (path: string) => !!expanded[path];
  const toggle = (path: string) => setExpanded((prev) => save({ ...prev, [path]: !prev[path] }));

  return (
    <aside id={id} className={`sidebar${open ? " sidebar--open" : ""}`} aria-label="Sidebar">
      <div className="sidebar__brand">
        <img src={logoMark} alt="" width={32} height={32} />
        <span className="sidebar__name">
          <span>MyFinancialTracker</span>
          <span className="sidebar__version">Version {APP_VERSION}</span>
        </span>
        {/* Only shown in the mobile drawer, so the drawer can always be closed from inside it. */}
        <button ref={closeRef} type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close menu">
          <CloseIcon />
        </button>
      </div>
      <nav className="sidebar__nav" aria-label="Main">
        {groups.map((group, i) =>
          group.parent ? (
            <div key={group.parent.path} className="sidebar__section sidebar__section--parent">
              <div className="sidebar__parent-row">
                {/* Marked "open" while one of its pages is showing, so you can see where you are. */}
                {anchor(
                  group.parent,
                  `sidebar__link sidebar__link--parent${group.items.some((c) => c.path === currentPath) ? " sidebar__link--open" : ""}`,
                )}
                <button
                  type="button"
                  className="sidebar__toggle"
                  aria-expanded={isExpanded(group.parent.path)}
                  aria-controls={`${id}-sub-${i}`}
                  aria-label={`${isExpanded(group.parent.path) ? "Hide" : "Show"} ${group.parent.label} pages`}
                  onClick={() => toggle(group.parent!.path)}
                >
                  <ChevronDownIcon />
                </button>
              </div>
              {/* Collapsed: zero rows tall and `visibility: hidden`, so its links leave the tab order too. */}
              <div className="sidebar__collapse" data-open={isExpanded(group.parent.path) || undefined}>
                <ul id={`${id}-sub-${i}`} className="sidebar__list sidebar__list--sub" aria-label={`${group.parent.label} pages`}>
                  {group.items.map(link)}
                </ul>
              </div>
            </div>
          ) : group.label ? (
            <div key={group.label} className="sidebar__section">
              <h2 className="sidebar__group" id={`${id}-group-${i}`}>
                {group.label}
              </h2>
              <ul className="sidebar__list" aria-labelledby={`${id}-group-${i}`}>
                {group.items.map(link)}
              </ul>
            </div>
          ) : (
            <ul key={i} className="sidebar__list">
              {group.items.map(link)}
            </ul>
          ),
        )}
        <ul className="sidebar__list sidebar__list--bottom">{bottom.map(link)}</ul>
      </nav>
      {/* Who's signed in, and the way out. */}
      <div className="sidebar__user">
        <span className="sidebar__avatar" aria-hidden="true">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <span className="sidebar__email" title={user.email}>
          <span className="visually-hidden">Signed in as </span>
          {user.email}
        </span>
        <button type="button" className="icon-button icon-button--sm" aria-label="Log out" title="Log out" onClick={onSignOut}>
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}
