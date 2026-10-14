# ProgressMeter

Shows how far along a budget or a savings goal is.

## What you provide

- `kind`: `"budget"` (spending against a limit) or `"goal"` (saving toward a target).
- `label`: what's measured ("Groceries", "Emergency fund").
- `value` and `max`, in the same unit (minor units are fine; only the ratio is drawn).
- `valueText`: the formatted readout, e.g. `"₱8,200 of ₱10,000"`. Build it with `formatMoney`.
- `status` (optional): the line under the bar ("₱1,800 left"). Without it, the meter writes "Over budget" or "Goal reached" for those states.
- `warnAt` (budget only, default `0.85`): the ratio where the bar turns marigold.

## States

| kind | state | fill |
| --- | --- | --- |
| budget | under `warnAt` | `pine` |
| budget | at or above `warnAt` | `marigold`, status in `marigold-ink` |
| budget | over 100% | `expense`, status "Over budget" |
| goal | any | `marigold` with a `marigold-ink` edge |

The bar never carries a state alone: the readout and the status line always say it in words.
