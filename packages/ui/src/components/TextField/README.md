# TextField

A labelled single-line input. For money, pass `prefix="₱"` and `inputMode="decimal"`.

## What you provide

- `label` (required): always visible. Placeholders are examples, never labels.
- `hint`: helper text under the field ("Shown on your monthly report").
- `error`: replaces the hint, sets `aria-invalid`, and thickens the border to 2px `expense`. It says what to fix: "Enter an amount above ₱0", not "Invalid input".
- `prefix` / `suffix`: fixed text inside the box ("₱", "/ month").
- All native `<input>` attributes. The ref goes to the `<input>`.

## Do

- Parse typed pesos into minor units at submit (`Math.round(Number(value) * minorUnitFactor("PHP"))`) and store integers.
