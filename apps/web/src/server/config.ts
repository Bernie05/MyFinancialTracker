/**
 * Development switches.
 *
 * REQUIRE_LOGIN
 *   true  → normal app: /login and /register, every API call needs a session.
 *   false → development shortcut: no login page; requests without a session act as DEV_USER_EMAIL.
 *           The server then listens on 127.0.0.1 only and refuses to start when NODE_ENV=production.
 *           Requires the account to exist: `bun run db:seed:demo`.
 */
export const REQUIRE_LOGIN = false;

/** The account used when REQUIRE_LOGIN is false (owns the demo data). */
export const DEV_USER_EMAIL = "demo@mft.local";
