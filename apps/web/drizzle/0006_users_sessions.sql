-- Accounts and per-user data.
-- 1. users + sessions (session tokens are stored only as SHA-256 hashes).
-- 2. Existing rows (a database from before accounts) get an owner: a placeholder account
--    demo@mft.local with an unusable password ("!"). `bun run db:seed:demo` sets its password and prints it.
--    On a fresh database there are no rows, so no placeholder is created.
-- 3. user_id is added to every data table: NOT NULL, cascades with the user. SQLite can only ADD a NOT NULL
--    column with a default, so it gets DEFAULT 0 (no such user): an insert that forgets user_id fails the
--    foreign key instead of creating orphaned data. migrate.ts runs this with FK checks off, then verifies them.
-- 4. Unique names and colors become per user.
-- Rollback: rebuild each table without user_id, then DROP TABLE sessions; DROP TABLE users;
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
INSERT INTO `users` (`email`, `password_hash`)
SELECT 'demo@mft.local', '!'
WHERE EXISTS (SELECT 1 FROM `categories`)
   OR EXISTS (SELECT 1 FROM `credit_cards`)
   OR EXISTS (SELECT 1 FROM `budgets`)
   OR EXISTS (SELECT 1 FROM `card_payments`)
   OR EXISTS (SELECT 1 FROM `debts`)
   OR EXISTS (SELECT 1 FROM `installments`)
   OR EXISTS (SELECT 1 FROM `savings_goals`)
   OR EXISTS (SELECT 1 FROM `transactions`);--> statement-breakpoint
ALTER TABLE `categories` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `categories` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `credit_cards` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `credit_cards` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `budgets` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `budgets` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `card_payments` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `card_payments` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `debts` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `debts` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `installments` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `installments` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `savings_goals` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `savings_goals` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
ALTER TABLE `transactions` ADD `user_id` integer NOT NULL DEFAULT 0 REFERENCES users(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `transactions` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'demo@mft.local');--> statement-breakpoint
DROP INDEX `categories_name_type_parent_unique`;--> statement-breakpoint
DROP INDEX `categories_color_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_parent_unique` ON `categories` (`user_id`, `name`, `type`, coalesce(`parent_id`, 0));--> statement-breakpoint
CREATE UNIQUE INDEX `categories_color_unique` ON `categories` (`user_id`, `color`);--> statement-breakpoint
CREATE INDEX `categories_user_idx` ON `categories` (`user_id`);--> statement-breakpoint
DROP INDEX `credit_cards_name_unique`;--> statement-breakpoint
DROP INDEX `credit_cards_color_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_name_unique` ON `credit_cards` (`user_id`, `name`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_color_unique` ON `credit_cards` (`user_id`, `color`);--> statement-breakpoint
CREATE INDEX `credit_cards_user_idx` ON `credit_cards` (`user_id`);--> statement-breakpoint
CREATE INDEX `budgets_user_idx` ON `budgets` (`user_id`);--> statement-breakpoint
CREATE INDEX `card_payments_user_idx` ON `card_payments` (`user_id`);--> statement-breakpoint
CREATE INDEX `debts_user_idx` ON `debts` (`user_id`);--> statement-breakpoint
CREATE INDEX `installments_user_idx` ON `installments` (`user_id`);--> statement-breakpoint
CREATE INDEX `savings_goals_user_idx` ON `savings_goals` (`user_id`);--> statement-breakpoint
CREATE INDEX `transactions_user_occurred_on_idx` ON `transactions` (`user_id`, `occurred_on`);
