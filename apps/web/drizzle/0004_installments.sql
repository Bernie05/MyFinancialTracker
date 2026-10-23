-- Installment plans on cards, and the link from each billed month (an auto-generated expense) to its plan.
-- Deleting a plan deletes its generated expenses (ON DELETE cascade). Rollback: drop the two columns and the
-- table (SQLite needs a transactions rebuild to drop a referencing column).
CREATE TABLE `installments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`description` text NOT NULL,
	`purchased_on` text NOT NULL,
	`principal_minor` integer NOT NULL,
	`months` integer NOT NULL,
	`add_on_rate_bps` integer DEFAULT 0 NOT NULL,
	`amortization_minor` integer,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`first_billing_month` text NOT NULL,
	`preterminated_on` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "installments_principal_positive" CHECK("installments"."principal_minor" > 0),
	CONSTRAINT "installments_months_range" CHECK("installments"."months" between 1 and 60),
	CONSTRAINT "installments_rate_range" CHECK("installments"."add_on_rate_bps" between 0 and 500),
	CONSTRAINT "installments_amortization_positive" CHECK("installments"."amortization_minor" is null or "installments"."amortization_minor" > 0),
	CONSTRAINT "installments_fee_nonnegative" CHECK("installments"."fee_minor" >= 0),
	CONSTRAINT "installments_preterminated_after_purchase" CHECK("installments"."preterminated_on" is null or "installments"."preterminated_on" >= "installments"."purchased_on")
);
--> statement-breakpoint
CREATE INDEX `installments_card_idx` ON `installments` (`card_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_id` integer REFERENCES installments(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_seq` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_installment_seq_unique` ON `transactions` (`installment_id`,`installment_seq`);