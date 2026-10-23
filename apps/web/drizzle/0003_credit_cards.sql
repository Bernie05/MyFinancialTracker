-- Credit cards: credit_cards, card_payments, and a nullable transactions.card_id (expenses only).
-- transactions is rebuilt to add the column's FK and CHECK (ids preserved; card_id starts NULL).
-- Rollback: rebuild transactions without card_id the same way, then DROP TABLE card_payments; DROP TABLE credit_cards;
CREATE TABLE `card_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "card_payments_amount_positive" CHECK("card_payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `card_payments_card_paid_on_idx` ON `card_payments` (`card_id`,`paid_on`);--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`last4` text,
	`limit_minor` integer NOT NULL,
	`closing_day` integer NOT NULL,
	`due_day` integer NOT NULL,
	`notify_days` integer DEFAULT 3 NOT NULL,
	`color` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "credit_cards_last4" CHECK("credit_cards"."last4" is null or "credit_cards"."last4" glob '[0-9][0-9][0-9][0-9]'),
	CONSTRAINT "credit_cards_limit_positive" CHECK("credit_cards"."limit_minor" > 0),
	CONSTRAINT "credit_cards_closing_day" CHECK("credit_cards"."closing_day" between 1 and 31),
	CONSTRAINT "credit_cards_due_day" CHECK("credit_cards"."due_day" between 1 and 31),
	CONSTRAINT "credit_cards_notify_days" CHECK("credit_cards"."notify_days" between 0 and 30),
	CONSTRAINT "credit_cards_color_valid" CHECK("credit_cards"."color" in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or "credit_cards"."color" glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_name_unique` ON `credit_cards` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_color_unique` ON `credit_cards` (`color`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`description` text NOT NULL,
	`category_id` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`note` text,
	`card_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transactions_amount_positive" CHECK("__new_transactions"."amount_minor" > 0),
	CONSTRAINT "transactions_card_expense_only" CHECK("__new_transactions"."card_id" is null or "__new_transactions"."type" = 'expense')
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "type", "amount_minor", "description", "category_id", "occurred_on", "note", "card_id", "created_at") SELECT "id", "type", "amount_minor", "description", "category_id", "occurred_on", "note", NULL, "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_occurred_on_idx` ON `transactions` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_card_occurred_on_idx` ON `transactions` (`card_id`,`occurred_on`);