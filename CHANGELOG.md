# Changelog

Versions follow [semantic versioning](https://semver.org): **MAJOR.MINOR.PATCH**.

- **MAJOR**: a stable release, or a change that breaks existing data or habits. 1.0.0 is the first stable version.
- **MINOR**: new features, nothing broken.
- **PATCH**: fixes only.

The version lives in `apps/web/src/shared/version.ts` (shown in the sidebar) and in both `package.json` files. A test keeps them equal.

## 0.1.0 (2026-11-09)

The first versioned release. It includes everything built so far:

- Sidebar sections: **Income** (an overview of salary and other income) with **My Salary** and **Other Income** under it, and **Expenses** (an overview of spending by how you paid) with **Online Credit** (SPayLater, Lazada PayLater, Home Credit), **Credit Cards** (bank cards) and **Cash & Others** under it. The version shows under the app name.
- Cards have a type, bank credit card or online credit, and each type has its own page.
- One shared section dashboard for Online Credit, Credit Cards, Cash & Others and Other Income: pick all accounts (or categories) or one, and a month. The credit summary, the tiles, the chart by month and the "By account" list all follow the pick, so it works with any number of accounts.
- "Paid with" follows the section: a charge added on an online credit account offers only online credit accounts, on a bank card only bank cards, and Cash & Others is cash or debit only.
- Delete an account or card even when it has history: the confirmation spells out that its charges, loans and payments go with it (Archived still keeps the history). Online Credit has a Delete button on each account.
- Online Credit and Credit Cards are one page with the same features (dashboard, payments due, active plans, finished plans, the month's transactions, accounts with delete); only the words and data differ. Cash & Others follows the same layout: a header with its Add button (Add expense opens a dialog), the same dashboard by category, and the same month's Transactions card. All three sections share that card, with Edit and Delete on each row (billed loan and installment months stay read-only). The full ledger, with filters, search and pages, is now **All expenses** (`/expenses/all`), where "View all charges" and the dashboard's "View all" lead.
- Expenses is now the summary of its three sections: totals (spent, credit used, monthly payments, due in 30 days), one card per section (Online Credit, Credit Cards, Cash & Others) with its own figures, and one Payments due list for every account.
- Credit Cards and Cash & Others now follow the Online Credit layout, each with its own data. Credit Cards keeps the full page even with no cards yet: zero totals, and the cards list offers Add card. Cash & Others has **monthly budgets** per category (set one with Set budget on a category tile). It shows monthly budget − spent = left in the same summary design, Left to spend (with a daily amount) and Over budget tiles, a Budgets list with a meter per category, the month's transactions, and the category tiles.
- An Online Credit account page now has **Other charges** above its loans: everyday charges by statement cycle, grouped by category, with Add charge, Edit and Delete, as on a bank card.
- The **Accounts** list (Online Credit), the **Cards** list (Credit Cards) and the **Categories** tiles (Cash & Others) now sit at the top of their page, above the dashboard.
- On an account or card page, every collapsible group (Other charges and its categories, each loan or plan, Card payments) now starts closed.
- Card and account editor: **+ Add person** under "Usually used by" adds someone by name without leaving the form, and picks them.
- Online Credit and Credit Cards no longer have a "Next payment" tile: Payments due already lists every upcoming payment. The three tiles left (spent, due now, still to bill) fill the row.
- Online Credit "Payments due": a scrollable list of every payment still to make, by account and due date (billed and unpaid, then each future loan month), with what it's for and the amount.
- Back links: section pages lead back to their parent (Online Credit, Credit Cards and Cash & Others → Expenses; My Salary and Other Income → Income), and an account or person page back to its list.
- Editing a loan shows only the loan's fields (no add-on rate, bank's monthly amount or processing fee).
- Credit summary on Online Credit, Credit Cards and the Expenses overview: total credit limit − credit used = available credit. The Expenses and Income overviews add up the sections under them (online + cards + cash; salary + other income).
- Loans: **Add loan** inside any account or card (what it's for, category, amount, loan date, months to pay, first payment). A loan is marked with its type automatically: online loan on an online credit account, bank credit loan on a bank card and its unpaid amount comes off the account's available credit. Online Credit lists every loan with its monthly payment, next due date and progress.
- Dashboard: pick any month and year (the current ones by default). It shows income, expenses and savings for that month and for the year, a savings rate (green when you saved, red when you overspent), income vs expenses by month, quarter or year, where the money went that month, quarter or year, upcoming card due dates and recent transactions.
- My Salary: set your gross pay per month or per year, list what comes off each payslip (withholding tax, SSS, PhilHealth, Pag-IBIG and any others), and see the annual, monthly and take-home figures. Includes an optional estimate from 2025 Philippine rates.
- Expenses and income, with categories and subcategories.
- Credit cards: statements, due dates, payments and installment plans with add-on rates.
- People: split charges with friends and family and track what they owe you.
- Excel import and export.
- Accounts: login, per-user data and password change.
