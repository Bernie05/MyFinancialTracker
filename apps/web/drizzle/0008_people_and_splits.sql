CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_name_unique` ON `people` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `people_user_idx` ON `people` (`user_id`);--> statement-breakpoint
CREATE TABLE `person_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_on` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "person_payments_amount_positive" CHECK("person_payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `person_payments_person_idx` ON `person_payments` (`person_id`,`paid_on`);--> statement-breakpoint
CREATE TABLE `transaction_shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`transaction_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transaction_shares_amount_nonnegative" CHECK("transaction_shares"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_shares_unique` ON `transaction_shares` (`transaction_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `transaction_shares_person_idx` ON `transaction_shares` (`person_id`);--> statement-breakpoint
ALTER TABLE `credit_cards` ADD `default_person_id` integer REFERENCES people(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `installments` ADD `split` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `split` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `my_share_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing transactions were all yours.
UPDATE `transactions` SET `my_share_minor` = `amount_minor`;