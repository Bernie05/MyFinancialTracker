# Amount

Renders a money value from integer minor units, with tabular figures and a smaller, raised currency symbol.

**Use it for every amount in the app.** Never format money inline: one component means one rounding rule, one minus sign and one alignment.

## What you provide

- `minorUnits` (required): an integer in centavos. `125050` renders `₱1,250.50`. Negative means money out.
- `currency` (default `"PHP"`) and `locale` (default `"en-PH"`): passed to `Intl.NumberFormat`.
- `signDisplay`: `"auto"` (minus only), `"always"` (`+` and `−`; use in ledgers), `"never"` (absolute value, e.g. "₱1,800 left").
- `tone`: `"auto"` colors by sign only when `signDisplay="always"`. Balances stay `ink`; pass `"income"` / `"expense"` to force.
- `size`: `sm` (caption), `md` (rows, default), `lg` (stat tiles), `display` (the one headline figure per screen).

## Do

- Keep amounts right-aligned in lists; tabular figures line the digits up.
- Pair color with the sign: `+` reads as income, `−` as expense, even in grayscale.

## Don't

- Don't pass decimal pesos (`1250.5`). Convert at the input boundary with `minorUnitFactor()`.
- Don't use `display` more than once per screen.
