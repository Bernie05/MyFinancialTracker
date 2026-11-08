PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credit_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`last4` text,
	`limit_minor` integer NOT NULL,
	`closing_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`notify_days` integer DEFAULT 3 NOT NULL,
	`color` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`installment_rates` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credit_cards_installment_rates_json" CHECK(json_valid("__new_credit_cards"."installment_rates") and json_type("__new_credit_cards"."installment_rates") = 'array'),
	CONSTRAINT "credit_cards_last4" CHECK("__new_credit_cards"."last4" is null or "__new_credit_cards"."last4" glob '[0-9][0-9][0-9][0-9]'),
	CONSTRAINT "credit_cards_limit_positive" CHECK("__new_credit_cards"."limit_minor" > 0),
	CONSTRAINT "credit_cards_closing_day" CHECK("__new_credit_cards"."closing_day" between 1 and 31),
	CONSTRAINT "credit_cards_due_day" CHECK("__new_credit_cards"."due_day" between 1 and 31),
	CONSTRAINT "credit_cards_notify_days" CHECK("__new_credit_cards"."notify_days" between 0 and 30),
	CONSTRAINT "credit_cards_color_valid" CHECK("__new_credit_cards"."color" in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or "__new_credit_cards"."color" glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);
--> statement-breakpoint
INSERT INTO `__new_credit_cards`("id", "user_id", "name", "issuer", "last4", "limit_minor", "closing_day", "due_day", "notify_days", "color", "archived", "installment_rates", "created_at") SELECT "id", "user_id", "name", "issuer", "last4", "limit_minor", "closing_day", "due_day", "notify_days", "color", "archived", '[]', "created_at" FROM `credit_cards`;--> statement-breakpoint
DROP TABLE `credit_cards`;--> statement-breakpoint
ALTER TABLE `__new_credit_cards` RENAME TO `credit_cards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_name_unique` ON `credit_cards` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `credit_cards_user_idx` ON `credit_cards` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_color_unique` ON `credit_cards` (`user_id`,`color`);