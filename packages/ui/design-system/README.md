MyFinancialTracker is a personal budget app: a dashboard, income and expense tracking, savings goals, debt and reports. The interface is modern fintech: calm cool neutrals, one strong cobalt accent, rounded surfaces and big, exact numbers. The numbers come first. Every rule below names the token, style or component to use.

## Content fundamentals

- **Speak to one person about their own money.** Use "you" and "your"; the app never says "we". Write "You spent ₱2,300 more than September", not "Spending increased by 7.8%".
- **Sentence case everywhere**: buttons, titles, badges. No all-caps labels.
- **Name things by what they are to the user**: "Emergency fund", "Groceries", "Left to spend". Avoid system terms such as "allocation", "ledger entry" or "category ID".
- **Buttons are verbs that say what happens**, and the verb carries through the flow: "Add expense" → "Expense added"; "Delete transaction" → "Transaction deleted".
- **Errors say what to fix**, in the interface's voice, without apology: "Enter an amount above ₱0". An empty list invites the next step: "No expenses yet this month. Add your first one."
- **Money is always written by `Amount`** in the user's currency (default `PHP`, locale `en-PH`): `₱1,250.50`, with a typographic minus `−` and a `+` on income in ledgers. Never write "PHP 1250.5".
- No emoji in the interface.

## Visual foundations

### Color

- Page ground (and the sidebar) is `surface`. Cards sit on it in `surface-raised` with `shadow-card`: a soft lift in light, a 1px outline in dark. Inputs keep a `line-strong` border. Wells, meter tracks and the segmented-control groove use `surface-sunken`.
- Text is `ink`; secondary text (dates, hints, labels) is `ink-muted`. Both hold 4.5:1 on all three surfaces in both themes.
- `accent` (cobalt `#2550d9`) is the one brand colour: the primary button, the active nav item, links, a budget meter that's on track, and the single hero surface per screen. Put `on-accent` on it (`on-accent-muted` for secondary text). `accent-soft` is its quiet tint for selected states and icon wells.
- `marigold` belongs to savings goals and nothing else, plus the budget's near-limit warning. It is a fill, never text. Goal text uses `marigold-ink`, and a marigold fill on a track gets a 1px `marigold-ink` edge, because marigold alone is only 1.9:1 on `surface-sunken` in light.
- **Money direction is success versus danger**: `income` (green) for money in, `expense` (red) for over-budget and errors. Ledgers show income in `income` with a `+`; ordinary spending stays in `ink` with a `−`, so red means trouble, not every purchase. Both always come with a sign or an arrow, so color is never the only cue.
- `expense` doubles as the destructive and error color (danger button, field errors, over budget).
- `focus` is the only focus color: a 2px solid ring, offset 2px, holding 3:1 on every surface.
- Charts use `chart-1` … `chart-6` in that fixed order, validated for color-vision deficiency in both themes. A spending category keeps its slot everywhere: its Badge dot, its pie slice and its bar. A seventh category folds into "Other". `chart-2` and `chart-6` fall below 3:1 on light surfaces, so label those series directly. Don't use chart colors for status. Income-vs-expense charts use `chart-income` and `chart-expense`, validated as a pair (the pair sits in the 6–8 ΔE band in both themes, so those charts always ship a legend, fixed series order and a table).
- Dark mode is its own set of steps, not an inversion. Accents lighten (`accent` becomes `#7b9bff`), so text on them flips dark through `on-accent` and `on-expense`.

### Type

- One family: **Hanken Grotesk** (variable, 100–900, upright and italic), via `--font-sans`. Its digits are tabular by default, which keeps columns of amounts aligned. Still set `font-variant-numeric: tabular-nums` on numbers so fallback fonts behave.
- The scale steps around 15px body: `display` 48/52 bold, tracked −0.035em → `title-1` 30/36 → `amount` 26/32 → `title-2` 17/24 → `body` 15/22 → `label` 13/18 → `caption` 12/16. Big numbers are bold and tight; card titles stay small so figures lead.
- `display` is for **one figure per screen**: what's left this month on the dashboard hero. Screen titles use `title-1`, card titles `title-2`, stat-tile figures `amount`.
- In `Amount`, the currency symbol drops to about 0.62em and rides the cap line, so the digits read first. This is the system's signature; don't restyle amounts by hand.
- Keep text lines under 80 characters.

### Space, radii, elevation

- A 4px base: `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 24 · `space-6` 32 · `space-7` 48. Card padding is `space-5`, or `space-4` under 480px. Gaps between cards are `space-5`, and between screen sections `space-6`.
- Radii follow hierarchy: `radius-sm` (12px) for inputs, selects and nav items, `radius-md` (20px) for cards, `radius-lg` (28px) for the one hero surface, `radius-pill` for buttons, chips and meter tracks.
- Cards rest on `shadow-card`. `shadow-raised` is reserved for layers that float above content: tooltips, the mobile drawer, popovers.

### States and motion

- Hover darkens a fill (`accent-hover`, `expense-hover`) or tints a ghost with `accent-soft`. Disabled is 50% opacity with a not-allowed cursor.
- Selection is shown by shape and weight as well as color. The selected segment is raised, outlined and set at 650 weight.
- Motion answers the user: a meter fill eases to its new width in 240ms, and hover transitions take 120ms. Nothing moves on its own. `prefers-reduced-motion` removes transitions.

### Layout

- Mobile first. The dashboard stacks cards in one column, then moves to a 12-column grid at 1024px. The stat-tile row goes 1 → 3 across.
- Amounts are right-aligned in lists; descriptions truncate before amounts wrap.

## Iconography

- The system ships **no public icon set yet**. Its components draw three internal 16px glyphs (arrow up-right, arrow down-right, minus) on a 1.75px round stroke in `currentColor`. When an icon set is chosen, match that grid and stroke.
- The logo mark (Logos group) is three ascending bars on an `accent` tile, with the tallest in `marigold` for the savings goal. The wordmark is "MyFinancialTracker" set in Hanken Grotesk 650 in `ink`. There is no drawn wordmark.

## Using the components

Load React 18, then the bundle; everything is on `window.MFT` (in the app: `import { Button } from "@mft/ui"`). Format money with `MFT.formatMoney(minorUnits, { currency, locale })`, and store amounts as integer minor units (centavos), never floats.
