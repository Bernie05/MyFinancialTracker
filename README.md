# MyFinancialTracker

A personal budget app: dashboard, income and expense tracking, savings goals, debt and reports.

This repository is a [Bun](https://bun.com) workspace. Bun is the package manager, the script runner and the bundler.

```
packages/
  ui/        @mft/ui — design tokens and React components (the design system)
```

## Getting started

```sh
bun install
bun run build       # builds packages/ui (tokens → CSS, ESM library, IIFE bundle, types)
bun run typecheck
bun run ds:export   # writes design-system-export/ for the claude.ai Design System artifact
```

Requires Bun 1.1 or newer.
