# Select

A labelled native `<select>` that matches TextField: same height, border, focus ring and error state, plus a chevron.

## What you provide

- `label` (required): always visible.
- `options`: `{ value, label }[]`. Put an "All …" or "Choose …" option first when nothing is a valid choice.
- `hint` / `error`: as in TextField. `error` sets `aria-invalid` and the 2px `expense` border.
- `prefix`: decorative content inside the box before the value, such as the selected category's color dot.
- All native `<select>` attributes. The ref goes to the `<select>`.

## Do

- Use it for short, known lists (categories, page size, date presets). It stays native so the platform picker, type-ahead and screen readers work.

## Don't

- Don't use it for two or three options that should all be visible; use SegmentedControl.
