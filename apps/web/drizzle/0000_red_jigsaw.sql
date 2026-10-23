CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`month` text NOT NULL,
	`limit_minor` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budgets_limit_positive" CHECK("budgets"."limit_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_month_unique` ON `budgets` (`category_id`,`month`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "categories_color_range" CHECK("categories"."color" between 1 and 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_unique` ON `categories` (`name`,`type`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`lender` text,
	`principal_minor` integer NOT NULL,
	`balance_minor` integer NOT NULL,
	`interest_rate_bps` integer DEFAULT 0 NOT NULL,
	`due_day` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "debts_principal_positive" CHECK("debts"."principal_minor" > 0),
	CONSTRAINT "debts_balance_non_negative" CHECK("debts"."balance_minor" >= 0),
	CONSTRAINT "debts_rate_non_negative" CHECK("debts"."interest_rate_bps" >= 0),
	CONSTRAINT "debts_due_day_range" CHECK("debts"."due_day" is null or "debts"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_minor` integer NOT NULL,
	`saved_minor` integer DEFAULT 0 NOT NULL,
	`target_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "savings_goals_target_positive" CHECK("savings_goals"."target_minor" > 0),
	CONSTRAINT "savings_goals_saved_non_negative" CHECK("savings_goals"."saved_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`description` text NOT NULL,
	`category_id` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transactions_amount_positive" CHECK("transactions"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `transactions_occurred_on_idx` ON `transactions` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);