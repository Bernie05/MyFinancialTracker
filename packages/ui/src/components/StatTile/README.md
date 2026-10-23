# StatTile

One headline figure with its label and an optional trend line. Lay several out in a row on the dashboard.

## What you provide

- `label`: what the number is ("Spent this month", "Net worth").
- `value`: a non-money figure ("67%", "22") in the same style; replaces the amount.
- `minorUnits`, `currency`, `locale`: as in Amount.
- `size`: `lg` (default) or `display` for the screen's single hero figure.
- `trend` (optional): `{ direction: "up" | "down" | "flat", sentiment: "positive" | "negative" | "neutral", text }`.
  The caller decides sentiment, because spending going up is bad news and income going up is good news.
  The arrow shows direction, the color shows sentiment (`income` blue for good, `expense` orange for bad), and `text` says it in words: "₱2,300 more than September".

## Don't

- Don't use a StatTile for a non-money count. It always renders an Amount.
