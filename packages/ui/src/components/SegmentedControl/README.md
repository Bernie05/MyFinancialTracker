# SegmentedControl

Picks one of two to four options in place: Expense / Income, Week / Month / Year.

## What you provide

- `options`: `{ value, label }[]`, two to four items. Use a select for more.
- `value` and `onChange`: controlled.
- `aria-label` (required): names the group ("Transaction type").
- `size`: `md` (default) or `sm` inside card headers.

## Behavior

It's a radio group: Tab enters once and lands on the selected option. Arrow keys move the selection, and Home and End jump to the ends. The selected option is raised, outlined and bold, so it doesn't rely on color.
