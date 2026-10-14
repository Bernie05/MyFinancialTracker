# MyFinancialTracker

A personal budget app: dashboard, income and expense tracking, savings goals, debt and reports.

This repository is a [Bun](https://bun.com) workspace. Bun is the package manager, the script runner and the bundler.

```
apps/
  web/       @mft/web: Bun server + React client + Drizzle/SQLite (see apps/web/README.md)
packages/
  ui/        @mft/ui: design tokens and React components (the design system)
```

## Getting started

```sh
bun install
bun run db:setup    # generate + apply migrations, seed default categories
bun run dev         # builds packages/ui, then serves the app at http://localhost:3000
bun run build       # builds packages/ui (tokens → CSS, ESM library, IIFE bundle, types)
bun run typecheck
bun run ds:export   # writes design-system-export/ for the claude.ai Design System artifact
```

Requires Bun 1.1 or newer.
