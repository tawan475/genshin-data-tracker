-- Planner v2, phase 1: hand edits on top of the newest capture.
-- inventory_adjustments: material counts typed in or spent by a Done, each tied
-- to the capture it was made against (base_seen_at = that capture's last_seen_at).
-- planner_targets.current: a goal's current state set by hand. A new table and a
-- nullable ADD COLUMN only: no table rebuild. Apply before deploying the Worker.
CREATE TABLE `inventory_adjustments` (
	`account_id` integer NOT NULL,
	`key` text NOT NULL,
	`delta` integer DEFAULT 0 NOT NULL,
	`set_value` integer,
	`base_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `key`),
	FOREIGN KEY (`account_id`) REFERENCES `genshin_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `planner_targets` ADD `current` text;