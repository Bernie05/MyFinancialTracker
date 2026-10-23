-- categories.color: integer chart slot 1-6 -> text preset key or custom '#rrggbb'.
-- Each old slot maps to the preset with the same light/dark values, so nothing changes on screen:
--   1 blue, 2 amber, 3 green, 4 orange, 5 purple, 6 pink.
-- SQLite can't change a column type in place, so the table is rebuilt (ids preserved).
-- Rollback (drizzle has no down migrations; run by hand, then delete this entry from meta/_journal.json):
--   presets back to slots (blue 1, amber 2, green 3, orange 4, purple 5, pink 6; anything else -> 1),
--   rebuilt the same way with `color integer NOT NULL CHECK (color between 1 and 6)`.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "categories_color_valid" CHECK("__new_categories"."color" in ('red','orange','amber','yellow','green','teal','blue','indigo','purple','pink','brown','grey') or "__new_categories"."color" glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "name", "type", "color", "created_at")
SELECT "id", "name", "type",
	CASE "color" WHEN 1 THEN 'blue' WHEN 2 THEN 'amber' WHEN 3 THEN 'green' WHEN 4 THEN 'orange' WHEN 5 THEN 'purple' WHEN 6 THEN 'pink' ELSE 'grey' END,
	"created_at"
FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_type_unique` ON `categories` (`name`,`type`);
