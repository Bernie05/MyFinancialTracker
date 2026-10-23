-- Subcategories: categories.parent_id (one level, same type: enforced by the API). Colors belong to
-- parents; a subcategory stores null and inherits. Every existing category becomes a parent with its
-- color, so nothing changes on screen. Names are unique within a parent (top level counts as 0).
-- The table is rebuilt to make color nullable and add the self-reference (ids preserved).
-- Rollback: rebuild without parent_id and with color NOT NULL (after deleting or re-parenting subcategories).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text,
	`parent_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "categories_color_valid" CHECK("__new_categories"."color" is null or "__new_categories"."color" in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or "__new_categories"."color" glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
	CONSTRAINT "categories_color_parent_only" CHECK(("__new_categories"."parent_id" is null) = ("__new_categories"."color" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "name", "type", "color", "parent_id", "created_at") SELECT "id", "name", "type", "color", NULL, "created_at" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_parent_unique` ON `categories` (`name`, `type`, coalesce(`parent_id`, 0));--> statement-breakpoint
CREATE UNIQUE INDEX `categories_color_unique` ON `categories` (`color`);--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);
