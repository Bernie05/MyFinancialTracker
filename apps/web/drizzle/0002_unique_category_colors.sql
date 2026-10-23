-- One color per category. Existing duplicates are fixed first, deterministically:
-- the lowest id keeps the color; each later duplicate (in id order) takes the next preset
-- nobody uses (in preset order). If the presets run out, the rest get a hex derived from the id.
-- Rollback: DROP INDEX `categories_color_unique`; (the recolored rows keep their new colors).
WITH presets(key, ord) AS (
	VALUES ('red', 1), ('orange', 2), ('amber', 3), ('yellow', 4), ('green', 5), ('teal', 6),
	       ('blue', 7), ('indigo', 8), ('purple', 9), ('pink', 10), ('brown', 11), ('grey', 12)
),
keepers AS (
	SELECT c.color FROM `categories` c
	WHERE NOT EXISTS (SELECT 1 FROM `categories` o WHERE o.color = c.color AND o.id < c.id)
),
dups AS (
	SELECT c.id, row_number() OVER (ORDER BY c.id) AS rn FROM `categories` c
	WHERE EXISTS (SELECT 1 FROM `categories` o WHERE o.color = c.color AND o.id < c.id)
),
free AS (
	SELECT key, row_number() OVER (ORDER BY ord) AS rn FROM presets WHERE key NOT IN (SELECT color FROM keepers)
)
UPDATE `categories`
SET color = (SELECT f.key FROM dups d JOIN free f ON f.rn = d.rn WHERE d.id = `categories`.id)
WHERE id IN (SELECT d.id FROM dups d JOIN free f ON f.rn = d.rn);
--> statement-breakpoint
UPDATE `categories`
SET color = printf('#%02x%02x%02x', (id * 97) % 256, (id * 57) % 256, (id * 31) % 256)
WHERE EXISTS (SELECT 1 FROM `categories` o WHERE o.color = `categories`.color AND o.id < `categories`.id);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_color_unique` ON `categories` (`color`);
