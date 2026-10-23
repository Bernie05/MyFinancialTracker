import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardDetailPage } from "./features/cards/CardDetailPage";
import { CardsPage } from "./features/cards/CardsPage";
import { CategoriesPage } from "./features/categories/CategoriesPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { ExpensesReportPage } from "./features/reports/ExpensesReportPage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { AlertBell } from "./layout/AlertBell";
import {
  BudgetIcon,
  CardIcon,
  DashboardIcon,
  ExpensesIcon,
  IncomeIcon,
  MenuIcon,
  PlusIcon,
  ReportIcon,
  SettingsIcon,
  TagIcon,
} from "./layout/icons";
import { PlaceholderPage } from "./layout/PlaceholderPage";
import { startAddTransaction } from "./layout/quickAdd";
import { Sidebar, type NavItem } from "./layout/Sidebar";
import { refreshAlerts } from "./lib/alerts";
import { usePath } from "./lib/router";

const mainNav: NavItem[] = [
  { path: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { path: "/expenses", label: "Expenses", icon: <ExpensesIcon /> },
  { path: "/income", label: "Income", icon: <IncomeIcon /> },
  { path: "/cards", label: "Credit Cards", icon: <CardIcon /> },
];
const reportNav: NavItem[] = [
  { path: "/reports/budget", label: "Budget Report", icon: <BudgetIcon /> },
  { path: "/reports/expenses", label: "Expenses Report", icon: <ReportIcon /> },
];
const bottomNav: NavItem[] = [
  { path: "/categories", label: "Categories", icon: <TagIcon /> },
  { path: "/settings", label: "Settings", icon: <SettingsIcon /> },
];

const pages: Record<string, ReactNode> = {
  "/": <DashboardPage />,
  "/expenses": <TransactionsPage key="expense" type="expense" />,
  "/income": <TransactionsPage key="income" type="income" />,
  "/reports/budget": (
    <PlaceholderPage
      title="Budget Report"
      icon={<BudgetIcon />}
      heading="Budgets are on the way"
      message="Soon you'll set a monthly limit per category and see here how close you are. Until then, the Expenses Report shows where your money goes."
      action={{ href: "/reports/expenses", label: "Open Expenses Report" }}
    />
  ),
  "/reports/expenses": <ExpensesReportPage />,
  "/cards": <CardsPage />,
  "/categories": <CategoriesPage />,
  "/settings": (
    <PlaceholderPage
      title="Settings"
      icon={<SettingsIcon />}
      heading="Nothing to change yet"
      message="Currency and appearance will live here. The app uses Philippine pesos and follows your device's light or dark mode. Category names and colors have their own page."
      action={{ href: "/categories", label: "Manage categories" }}
    />
  ),
};

const allNav = [...mainNav, ...reportNav, ...bottomNav];

export function App() {
  const path = usePath();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(path);

  // A section owns its sub-pages: /cards/3 is still "Credit Cards".
  const section = allNav.find((item) => item.path === path || (item.path !== "/" && path.startsWith(`${item.path}/`)));
  const title = section?.label ?? "Page not found";
  const cardId = path.match(/^\/cards\/(\d+)$/)?.[1];

  // Card reminders: checked once on load; pages refresh them after payments and card expenses.
  useEffect(() => {
    refreshAlerts();
  }, []);

  // On navigation: update the tab title, start the new page at the top and move focus to it.
  // Compares paths rather than counting renders, so StrictMode's double effect doesn't fire it on load.
  useEffect(() => {
    document.title = `${title} · MyFinancialTracker`;
    if (lastPath.current === path) return;
    lastPath.current = path;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [path, title]);

  // The drawer: focus its close button on open; Escape closes it and returns focus to the toggle.
  useEffect(() => {
    if (!menuOpen) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div className="shell">
      <header className="mobilebar">
        <button
          ref={menuButton}
          type="button"
          className="icon-button mobilebar__menu"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon />
        </button>
        <span className="mobilebar__title">{title}</span>
        <AlertBell />
        <button type="button" className="icon-button icon-button--accent mobilebar__add" aria-label="Add transaction" onClick={startAddTransaction}>
          <PlusIcon />
        </button>
      </header>

      <Sidebar
        id="sidebar"
        main={mainNav}
        reports={reportNav}
        bottom={bottomNav}
        currentPath={section?.path ?? path}
        open={menuOpen}
        onNavigate={() => setMenuOpen(false)}
        onClose={closeMenu}
        closeRef={closeButton}
      />
      {menuOpen && <div className="shell__backdrop" onClick={closeMenu} aria-hidden="true" />}

      <main className="shell__main" ref={mainRef} tabIndex={-1}>
        {pages[path] ?? (cardId ? <CardDetailPage key={cardId} id={Number(cardId)} /> : null) ?? (
          <PlaceholderPage
            title="Page not found"
            icon={<DashboardIcon />}
            heading="This page doesn't exist"
            message="The link may be old or mistyped."
            action={{ href: "/", label: "Go to Dashboard" }}
          />
        )}
      </main>
    </div>
  );
}
