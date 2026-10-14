# Badge

A short pill label for a category or status: "Groceries", "Recurring", "Paid off".

## What you provide

- `children`: one or two words, sentence case.
- `tone`: `neutral` (default, categories), `income`, `expense`, `goal`. The tone carries meaning, so don't pick one for decoration.
- `category`: `1`–`6` adds a dot in `chart-1` … `chart-6`. Give each spending category a fixed slot so it matches its slice in the reports charts. A seventh category folds into "Other".

## Don't

- Don't make a badge clickable. Use a ghost Button or a SegmentedControl for filters.
