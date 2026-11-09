CREATE TABLE `salary_deductions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "salary_deductions_amount_nonnegative" CHECK("salary_deductions"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `salary_deductions_user_idx` ON `salary_deductions` (`user_id`,`position`);--> statement-breakpoint
CREATE TABLE `salary_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`basis` text NOT NULL,
	`gross_minor` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "salary_profiles_gross_positive" CHECK("salary_profiles"."gross_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_profiles_user_unique` ON `salary_profiles` (`user_id`);