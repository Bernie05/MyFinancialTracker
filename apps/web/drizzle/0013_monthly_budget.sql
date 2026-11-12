CREATE TABLE `monthly_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`limit_minor` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "monthly_budgets_limit_positive" CHECK("monthly_budgets"."limit_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_user_unique` ON `monthly_budgets` (`user_id`);