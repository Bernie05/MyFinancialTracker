# DESIGN.md: MyFinancialTracker

Source: code (fullstack-dev) · Status: Approved (direction chosen by the user: "Modern fintech") · Updated: 2026-10-22

Full rules live in `packages/ui/design-system/README.md`; token values in `packages/ui/src/tokens/tokens.ts` (generated CSS: `bun run tokens`). This file is the short handoff.

## Direction
Calm, modern fintech: cool soft neutrals, **one** strong cobalt accent, rounded surfaces, big tight numbers, generous whitespace. Boldness is spent in one place: the accent-filled hero on the Dashboard. Everything else stays quiet.

## Foundations
| | Light | Dark | Use |
|---|---|---|---|
| `surface` / `surface-raised` / `surface-sunken` | #f4f5f7 / #ffffff / #ebedf1 | #0d0f12 / #16191e / #0a0b0d | page + sidebar / cards, inputs / tracks, skeletons |
| `ink` / `ink-muted` | #121417 / #5a6170 | #eef0f3 / #a3aab6 | text (≥4.5:1 on all surfaces) |
| `accent` / `on-accent` | #2550d9 / #fff | #7b9bff / #0a1235 | primary action, active nav, links, hero |
| `income` (success) | #0e7a4f | #4cc38a | money in, always with `+` |
| `expense` (danger) | #c42f2f | #ff7b7b | over budget, errors, destructive |
| `marigold` / `marigold-ink` (warning) | #e2a52b / #8a5a00 | #e8b54d / #f0c565 | goals, near-limit |
| `chart-1…6`, `chart-income`, `chart-expense` | validated | validated | categories (fixed order); income vs expense marks |

- **Type:** Hanken Grotesk (self-hosted, OFL), tabular figures for money. display 48/52 −0.035em · title-1 30/36 · amount 26/32 · title-2 17/24 · body 15/22 · label 13/18 · caption 12/16.
- **Radius:** 12 inputs/nav · 20 cards · 28 hero · pill buttons and chips.
- **Elevation:** `shadow-card` (soft lift in light, 1px outline in dark) on cards and tiles; `shadow-raised` only for floating layers (tooltips, drawer).
- **Focus:** 2px `focus` ring, 2px offset, on every interactive element.

## Screens
| Screen | Route | Notes |
|---|---|---|
| Shell | all | Sidebar 264px (icons, "Report" group, Settings pinned bottom, accent-soft active item). Below 960px: sticky top bar (menu, title, + quick add) and a drawer with its own close button. |
| Dashboard | `/` | Header with "Add transaction"; hero (left over, savings meter, came in / went out); KPI tiles with month-over-month trend; income-vs-expense bars; category bars; recent transactions (top 6, "View all"). |
| Expenses / Income | `/expenses`, `/income` | Totals tiles; ledger card with **filters, then count + pagination, above the rows**; add form in a sticky side card (below the list on phones). Rows: category monogram, chip, date, amount (income green `+`, spending in ink `−`). |
| Expenses Report | `/reports/expenses` | Month stepper pill; category bars; expenses over 6 months. |
| Budget Report, Settings | `/reports/budget`, `/settings` | Designed empty states with icon, explanation, and a link to something useful now. |

## States
Loading: shaped skeletons (rows, bars, chart, inline figures). Error: alert icon, message, "Try again". Empty: icon, plain explanation, next action; filtered-empty offers "Clear filters". Motion: hover/press transitions and the drawer slide only; all off under `prefers-reduced-motion`.

## Components (@mft/ui)
Restyled: Button (pill), Card, StatTile (now a surface; new `value` prop for non-money figures), TextField, Badge (category chip), TransactionRow (monogram avatar, mobile two-row layout), SegmentedControl, ProgressMeter. New: **Select** (native, matches TextField). App-only: PageHeader, EmptyState, Skeleton, icons (20px, 1.75 stroke).
