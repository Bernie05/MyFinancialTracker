# TransactionRow

One ledger line: description, category, date and a signed amount.

## What you provide

- `description`: the payee or purpose ("Puregold Cubao", "October salary").
- `category` and `categoryColor` (1–6, or any CSS color such as `var(--cat-red)`; the monogram tints 18% of it under `ink` text, so any color stays readable): rendered as a Badge whose dot matches the category's chart color.
- `date`: a `Date` (formatted "Oct 12" with `locale`) or a ready string ("Today").
- `minorUnits`: signed. Negative is an expense (`−`, `expense` orange) and positive is income (`+`, `income` blue).
- `meta` (optional): an extra caption item ("BPI Savings", "Recurring").
- `action` (optional): a trailing control, usually a small ghost Button.

## Layout

Rows draw a top `line` divider and 20px side padding. Put them in a `<ul>` (one `<li>` per row) inside a Card with `padding="none"`. Long descriptions truncate with an ellipsis, and the amount never wraps.
