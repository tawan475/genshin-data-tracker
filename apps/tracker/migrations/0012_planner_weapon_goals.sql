-- Planner v2, phase 3: weapon goals get their own id, so two goals can be the
-- same weapon for the same character (planner_targets' key is kind + key +
-- owner, which allowed one). A new table and a copy: planner_targets is not
-- rebuilt. Every weapon row moves over with its target, hand-set current state
-- and updated_at, and a random id (12 hex digits); rowid keeps their order.
-- The weapon rows are then deleted from planner_targets, which keeps
-- characters, custom characters and item needs. Apply before deploying the
-- Worker that reads the new table (CI applies remote migrations first).
CREATE TABLE `planner_weapon_goals` (
	`account_id` integer NOT NULL,
	`id` text NOT NULL,
	`key` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`target` text NOT NULL,
	`updated_at` integer NOT NULL,
	`current` text,
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `planner_weapon_goals` (`account_id`, `id`, `key`, `owner`, `target`, `updated_at`, `current`)
SELECT `account_id`, lower(hex(randomblob(6))), `key`, `owner`, `target`, `updated_at`, `current`
FROM `planner_targets` WHERE `kind` = 'weapon'
ORDER BY `account_id`, `key`, `owner`;
--> statement-breakpoint
DELETE FROM `planner_targets` WHERE `kind` = 'weapon';
