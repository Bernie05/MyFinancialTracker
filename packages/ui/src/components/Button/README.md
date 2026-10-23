# Button

Triggers an action; its label says exactly what happens ("Add expense", "Save goal").

## What you provide

- `children`: the label, a verb first, in sentence case.
- `variant`: `primary` (one per view, `accent` fill), `secondary` (outlined), `ghost` (text-only, in cards and rows), `danger` (destructive: "Delete transaction").
- `size`: `md` (40px, default) or `sm` (32px, in rows and toolbars).
- `loading`: shows a spinner, keeps the width, blocks clicks.
- `iconStart`: an optional 16px icon element.
- `fullWidth`: stretches to the container on mobile forms.
- All native `<button>` attributes. `type` defaults to `"button"`; pass `type="submit"` in forms.

## Do

- Keep the same verb through the flow: the button that says "Add expense" produces a toast that says "Expense added".

## Don't

- Don't put two primary buttons side by side. Make the second one `secondary`.
- Don't disable a submit button to signal validation errors. Show the error on the field instead.
