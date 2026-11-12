CREATE TABLE `cash_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_cards_category_unique` ON `cash_cards` (`category_id`);--> statement-breakpoint
CREATE INDEX `cash_cards_user_idx` ON `cash_cards` (`user_id`);--> statement-breakpoint
-- Existing users keep the cards they see today: one per top-level expense category.
INSERT INTO `cash_cards` (`user_id`, `category_id`) SELECT `user_id`, `id` FROM `categories` WHERE `type` = 'expense' AND `parent_id` IS NULL ORDER BY `name`;
