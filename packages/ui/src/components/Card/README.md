# Card

Groups one topic on a screen: this month's budget, a savings goal, recent transactions.

## What you provide

- `title`: rendered as an `h2` by default (`headingLevel` changes it). It also names the section for screen readers.
- `subtitle`: one short line for the period or scope ("October 2026").
- `action`: one control at the top-right, usually a ghost Button ("See all") or a SegmentedControl (Week / Month).
- `padding`: `md` (24px, 16px on phones) or `none` so a TransactionRow list runs edge to edge.
- `children`: the content.

## Rules

- A card sits flat on `surface` with a `line` outline. Shadows belong to floating layers only (`shadow-raised`).
- Don't nest cards. Inside a card, separate groups with space or row dividers.
